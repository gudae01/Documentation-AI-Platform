package com.mediflow.backend.pd;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PdClinicalRecordSecurityIntegrationTest {
    @Autowired QuestionnaireService questionnaires;
    @Autowired PdClinicalRecordService clinicalRecords;
    @Autowired PdClinicalRecordRepository repository;
    @Autowired ObjectMapper json;

    @Test
    void encryptsApprovedRecordAndReturnsSameRecordForRetry() throws Exception {
        var created = questionnaires.create("01012345678", "SMS", LocalDate.of(2026, 9, 1), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var questionnaire = questionnaires.submit(token, json.readTree("""
                {"name":"홍길동","birth6":"800101","sex":"M","plannedDate":"2026-09-01","chiefComplaint":"떨림"}
                """));
        var request = new PdClinicalRecordController.ApproveRequest(
                "UPDRS: 18점",
                List.of(new PdClinicalRecordController.ResultItem(
                        "EMR 붙여넣기", "UPDRS", "18점", "의료진 최종 승인")),
                new PdClinicalRecordController.Soap("오른손 떨림", "보행 안정", "파킨슨 증상 관찰", "4주 후 추적"),
                Map.of("hrvCurrent", "42"),
                "visit.m4a",
                "ans.csv");

        var first = clinicalRecords.approve(questionnaire.getId(), request, "의료진");
        var retry = clinicalRecords.approve(questionnaire.getId(), request, "의료진");
        var stored = repository.findById(first.getId()).orElseThrow();

        assertThat(retry.getId()).isEqualTo(first.getId());
        assertThat(questionnaire.getStatus()).isEqualTo("REVIEWED");
        assertThat(stored.getPayloadCipher()).doesNotContain("UPDRS").doesNotContain("오른손 떨림");
        assertThat(clinicalRecords.read(stored).structuredResults()).containsExactlyElementsOf(request.structuredResults());
        assertThat(clinicalRecords.byPatient(questionnaire.getPatient().getId())).containsExactly(first);
    }
}
