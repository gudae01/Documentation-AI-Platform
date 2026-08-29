package com.mediflow.backend.pd;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PdApiAuthorizationIntegrationTest {
    @Autowired MockMvc mockMvc;

    @Test
    void blocksUnauthenticatedClinicianApiAndAllowsClinicianRole() throws Exception {
        mockMvc.perform(get("/api/pd/questionnaires")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/pd/clinical-records")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/pd/questionnaire-events")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/pd/questionnaires").with(user("doctor").roles("CLINICIAN")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/pd/clinical-records").with(user("doctor").roles("CLINICIAN")))
                .andExpect(status().isOk());
    }

    @Test
    void publicSubmissionStillRequiresCsrf() throws Exception {
        String body = "{\"name\":\"홍길동\"}";
        mockMvc.perform(post("/api/public/questionnaires/not-a-token/submit")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/public/questionnaires/not-a-token/submit").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());
    }

    @Test
    void blocksUnauthenticatedSttUpload() throws Exception {
        var audio = new MockMultipartFile("file", "recording.webm", "audio/webm", new byte[]{1, 2, 3});
        mockMvc.perform(multipart("/api/pd/stt/transcriptions").file(audio).with(csrf()))
                .andExpect(status().isUnauthorized());
    }
}
