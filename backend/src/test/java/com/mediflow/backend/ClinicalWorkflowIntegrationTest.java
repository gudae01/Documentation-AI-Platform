package com.mediflow.backend;

import com.mediflow.backend.patient.Patient;
import com.mediflow.backend.patient.PatientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ClinicalWorkflowIntegrationTest {

    private static final Pattern ID_PATTERN = Pattern.compile("\\\"id\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");

    @Autowired
    MockMvc mockMvc;

    @Autowired
    PatientRepository patientRepository;

    @BeforeEach
    void seedPatient() {
        if (!patientRepository.existsById("P-TEST-0001")) {
            patientRepository.save(new Patient(
                    "P-TEST-0001", "테스트환자", "여", LocalDate.of(1990, 1, 2),
                    "010-0000-0000", "서울", LocalDate.of(2026, 8, 1), 2,
                    "수면장애", "없음", "한방내과", List.of("수면장애")));
        }
    }

    @Test
    void protectedApiRequiresKakaoLogin() throws Exception {
        mockMvc.perform(get("/api/patients/P-TEST-0001"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void patientIsLookedUpOnlyByRegistrationNumber() throws Exception {
        mockMvc.perform(get("/api/patients/P-TEST-0001").with(login()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registrationNumber").value("P-TEST-0001"))
                .andExpect(jsonPath("$.name").value("테스트환자"));

        mockMvc.perform(get("/api/patients/테스트환자").with(login()))
                .andExpect(status().isNotFound());
    }

    @Test
    void followUpDraftCanBeRestoredAndApproved() throws Exception {
        String createBody = """
                {"registrationNumber":"P-TEST-0001","type":"FOLLOW_UP"}
                """;
        String created = mockMvc.perform(post("/api/encounters")
                        .with(login()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currentStep").value("PREVIOUS_DATA"))
                .andReturn().getResponse().getContentAsString();
        String encounterId = extractId(created);

        MockMultipartFile audio = new MockMultipartFile(
                "file", "consultation.wav", "audio/wav", "mock-audio".getBytes());
        mockMvc.perform(multipart("/api/encounters/{id}/attachments", encounterId)
                        .file(audio)
                        .param("type", "AUDIO")
                        .with(login()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("AUDIO"))
                .andExpect(jsonPath("$.originalFileName").value("consultation.wav"));

        mockMvc.perform(get("/api/encounters/{id}/attachments", encounterId).with(login()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].size").value(10));

        String draftBody = """
                {
                  "currentStep":"SOAP",
                  "chartText":"의사가 직접 작성한 원문 차트",
                  "chiefComplaint":"수면장애",
                  "symptoms":"3개월간 입면 지연과 아침 피로",
                  "assessment":"스트레스 연관 수면장애 판단",
                  "plan":"4주 후 재평가",
                  "soapSubjective":"잠들기 어렵고 아침에 피곤함",
                  "soapObjective":"혈압 128/82 mmHg",
                  "soapAssessment":"수면장애",
                  "soapPlan":"수면위생 교육",
                  "examinationText":"HRV 32 ms",
                  "autonomicTest":{"HRV":{"current":32,"previous":28,"unit":"ms"}},
                  "autonomicInterpretation":"이전보다 HRV가 증가함",
                  "recording":true,
                  "recordingSeconds":80,
                  "savedDevice":"iPad"
                }
                """;
        mockMvc.perform(put("/api/encounters/{id}/draft", encounterId)
                        .with(login()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(draftBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recording").value(true))
                .andExpect(jsonPath("$.savedDevice").value("iPad"));

        mockMvc.perform(get("/api/drafts/latest").with(login()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(encounterId))
                .andExpect(jsonPath("$.soap.subjective").value("잠들기 어렵고 아침에 피곤함"));

        mockMvc.perform(post("/api/encounters/{id}/approve", encounterId)
                        .with(login()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clinician\":\"홍길동\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.recording").value(false));

        mockMvc.perform(get("/api/drafts/latest").with(login()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/patients/P-TEST-0001/records").with(login()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].chiefComplaint").value("수면장애"))
                .andExpect(jsonPath("$[0].soap.assessment").value("수면장애"));
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor login() {
        return oauth2Login()
                .attributes(attributes -> attributes.put("id", 123456789L));
    }

    private String extractId(String json) {
        Matcher matcher = ID_PATTERN.matcher(json);
        if (!matcher.find()) {
            throw new AssertionError("응답에서 진료 ID를 찾을 수 없습니다: " + json);
        }
        return matcher.group(1);
    }
}
