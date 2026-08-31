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
    @Autowired QuestionnaireSubmissionRepository submissions;
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

    @Test
    void directEntryCreatesOneTimeInvitationAndSubmissionAppearsInSearch() throws Exception {
        var created = service.createDirect();
        var stored = invitations.findById(created.invitation().getId()).orElseThrow();

        assertThat(stored.getChannel()).isEqualTo("DIRECT");
        assertThat(stored.getDeliveryStatus()).isEqualTo(QuestionnaireInvitation.DeliveryStatus.NOT_REQUESTED);
        assertThat(stored.getTokenHash()).doesNotContain(created.token());

        var submitted = service.submit(created.token(), json.readTree(
                "{\"name\":\"회의환자\",\"birth6\":\"800101\",\"sex\":\"M\","
                        + "\"plannedDate\":\"2026-09-01\",\"chiefComplaint\":\"떨림\"}"));

        assertThat(service.search("회의환자", null, null, null, null))
                .extracting(QuestionnaireSubmission::getId)
                .contains(submitted.getId());
        assertThatThrownBy(() -> service.submit(created.token(), json.readTree(
                "{\"name\":\"회의환자\",\"birth6\":\"800101\",\"sex\":\"M\","
                        + "\"plannedDate\":\"2026-09-01\",\"chiefComplaint\":\"떨림\"}")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void repeatedReviewReturnsAlreadyReviewedSubmissionInsteadOfVersionConflict() throws Exception {
        var created = service.create("01099998888", "SMS", LocalDate.of(2026, 9, 2), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var submitted = service.submit(token, json.readTree("{\"name\":\"김환자\",\"birth6\":\"700101\",\"sex\":\"F\",\"plannedDate\":\"2026-09-02\",\"chiefComplaint\":\"보행 불편\"}"));

        var first = service.review(submitted.getId(), "환자 설명 확인", submitted.getVersion());
        var repeated = service.review(submitted.getId(), "환자 설명 확인", 0);

        assertThat(first.getStatus()).isEqualTo("REVIEWED");
        assertThat(repeated.getId()).isEqualTo(first.getId());
    }

    @Test
    void reviewedQuestionnaireCanBeRevisedWithCurrentVersion() throws Exception {
        var created = service.create("01077776666", "SMS", LocalDate.of(2026, 9, 4), 24, "doctor");
        String token = created.link().substring(created.link().indexOf("questionnaireToken=") + 19);
        var submitted = service.submit(token, json.readTree("{\"name\":\"이환자\",\"birth6\":\"680101\",\"sex\":\"M\",\"plannedDate\":\"2026-09-04\",\"chiefComplaint\":\"보행 불편\"}"));

        var reviewed = service.review(submitted.getId(), "환자 설명 확인", submitted.getVersion());
        submissions.flush();
        var revised = service.review(reviewed.getId(), "환자 설명 확인 및 낙상 이력 보완", reviewed.getVersion());
        submissions.flush();

        assertThat(revised.getStatus()).isEqualTo("REVIEWED");
        assertThat(service.decrypt(revised.getChartCipher())).isEqualTo("환자 설명 확인 및 낙상 이력 보완");
    }
}
