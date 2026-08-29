package com.mediflow.backend.pd;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PdClinicalRecordSecurityIntegrationTest {
    @Autowired QuestionnaireService questionnaires;
    @Autowired PdClinicalRecordService clinicalRecords;
    @Autowired PdClinicalRecordRepository repository;
    @Autowired PdClinicalRecordRevisionRepository revisions;
    @Autowired ObjectMapper json;
    @Autowired MockMvc mockMvc;

    @Test
    void encryptsApprovedRecordAndPreservesPreviousVersionWhenSoapChanges() throws Exception {
        var created = questionnaires.create("01012345678", "SMS", LocalDate.of(2026, 9, 1), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var questionnaire = questionnaires.submit(token, json.readTree("""
                {"name":"홍길동","birth6":"800101","sex":"M","plannedDate":"2026-09-01","chiefComplaint":"떨림"}
                """));
        var request = new PdClinicalRecordController.ApproveRequest(
                "UPDRS: 18점",
                "[환자] 오른손 떨림이 있습니다.",
                List.of(new PdClinicalRecordController.ResultItem(
                        "EMR 붙여넣기", "UPDRS", "18점", "의료진 최종 승인")),
                new PdClinicalRecordController.Soap("오른손 떨림", "보행 안정", "파킨슨 증상 관찰", "4주 후 추적"),
                Map.of("hrvCurrent", "42"),
                "visit.m4a",
                "ans.csv");

        var first = clinicalRecords.approve(questionnaire.getId(), request, "의료진");
        var retry = clinicalRecords.approve(questionnaire.getId(), request, "의료진");
        var revisedRequest = new PdClinicalRecordController.ApproveRequest(
                "UPDRS: 16점",
                "[환자] 오른손 떨림이 감소했습니다.",
                List.of(new PdClinicalRecordController.ResultItem(
                        "EMR 붙여넣기", "UPDRS", "16점", "의료진 최종 승인")),
                new PdClinicalRecordController.Soap("오른손 떨림 감소", "보행 안정", "증상 호전", "8주 후 추적"),
                Map.of("hrvCurrent", "45"),
                "visit-2.webm",
                "ans-2.csv");
        var revised = clinicalRecords.approve(questionnaire.getId(), revisedRequest, "수정 의료진");
        var stored = repository.findById(first.getId()).orElseThrow();
        var archived = revisions.findByClinicalRecordIdOrderByArchivedAtDesc(first.getId());

        assertThat(retry.getId()).isEqualTo(first.getId());
        assertThat(revised.getId()).isEqualTo(first.getId());
        assertThat(questionnaire.getStatus()).isEqualTo("REVIEWED");
        assertThat(stored.getPayloadCipher()).doesNotContain("UPDRS").doesNotContain("오른손 떨림");
        assertThat(clinicalRecords.read(stored).structuredResults()).containsExactlyElementsOf(revisedRequest.structuredResults());
        assertThat(clinicalRecords.read(stored).soap().subjective()).isEqualTo("오른손 떨림 감소");
        assertThat(archived).hasSize(1);
        assertThat(archived.get(0).getPayloadCipher()).doesNotContain("UPDRS").doesNotContain("오른손 떨림");
        assertThat(clinicalRecords.byPatient(questionnaire.getPatient().getId())).containsExactly(first);
    }

    @Test
    void clinicianCanApproveClinicalRecordThroughHttpApi() throws Exception {
        var created = questionnaires.create("01022223333", "SMS", LocalDate.of(2026, 9, 3), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var questionnaire = questionnaires.submit(token, json.readTree("""
                {"name":"이환자","birth6":"650101","sex":"M","plannedDate":"2026-09-03","chiefComplaint":"경직"}
                """));
        var request = new PdClinicalRecordController.ApproveRequest(
                "검사: 정상",
                "[의료진] 검사 결과를 확인했습니다.",
                List.of(new PdClinicalRecordController.ResultItem("EMR 붙여넣기", "검사", "정상", "승인")),
                new PdClinicalRecordController.Soap("경직", "검사 정상", "경과 관찰", "재진"),
                Map.of(), null, null);

        mockMvc.perform(put("/api/pd/questionnaires/{id}/clinical-record", questionnaire.getId())
                        .with(user("doctor").roles("CLINICIAN"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionnaireId").value(questionnaire.getId().toString()))
                .andExpect(jsonPath("$.structuredResults[0].value").value("정상"));
    }
}
