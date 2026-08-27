package com.mediflow.backend.pd;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest @ActiveProfiles("test") @Transactional
class QuestionnaireSecurityIntegrationTest {
    @Autowired QuestionnaireService service;
    @Autowired QuestionnaireInvitationRepository invitations;
    @Autowired ObjectMapper json;

    @Test
    void storesNoRawTokenOrRecipientAndBlocksReuse() throws Exception {
        var created = service.create("01012345678", "SMS", LocalDate.of(2026, 9, 1), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var stored = invitations.findById(created.invitation().getId()).orElseThrow();
        assertThat(stored.getTokenHash()).doesNotContain(token);
        assertThat(stored.getRecipientCipher()).doesNotContain("01012345678");
        service.submit(token, json.readTree("{\"name\":\"홍길동\",\"birth6\":\"800101\",\"sex\":\"M\",\"plannedDate\":\"2026-09-01\",\"chiefComplaint\":\"떨림\"}"));
        assertThatThrownBy(() -> service.submit(token, json.readTree("{\"name\":\"홍길동\",\"birth6\":\"800101\",\"sex\":\"M\",\"plannedDate\":\"2026-09-01\"}")))
                .isInstanceOf(IllegalStateException.class);
    }
}
