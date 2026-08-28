package com.mediflow.backend.pd;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.security.SensitiveDataCrypto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.security.SecureRandom;
import java.time.*;
import java.util.*;

@Service
public class QuestionnaireService {
    private static final List<String> STRUCTURED_FIELDS = List.of(
            "plannedDate", "respondent", "relationship", "allergy", "foodAllergy", "otherAllergy",
            "nonPdMedications", "pdOnset", "pdDiagnosis", "pdDiagnosisHospital", "initialSymptoms",
            "onsetSide", "currentStage", "dbsHistory", "rehabilitationHistory", "pdMedication",
            "medicationTiming", "medicationEffect", "wearingOff", "medicationSideEffects",
            "chiefComplaint", "symptomDetail", "symptomTiming", "laterality", "onOffRelation",
            "aggravatingFactors", "relievingFactors", "painNrs", "fallSafety", "pastHistory",
            "familyHistory", "diet", "digestion", "bowel", "urine", "sleep", "bodyFacts", "brainFacts"
    );

    private final QuestionnaireInvitationRepository invitations;
    private final QuestionnaireSubmissionRepository submissions;
    private final PdPatientRepository patients;
    private final SensitiveDataCrypto crypto;
    private final QuestionnaireDeliveryService delivery;
    private final ObjectMapper json;
    private final String publicUrl;
    private final SecureRandom random = new SecureRandom();

    public QuestionnaireService(QuestionnaireInvitationRepository invitations,
                                QuestionnaireSubmissionRepository submissions,
                                PdPatientRepository patients,
                                SensitiveDataCrypto crypto,
                                QuestionnaireDeliveryService delivery,
                                ObjectMapper json,
                                @Value("${app.questionnaire.public-url}") String publicUrl) {
        this.invitations = invitations;
        this.submissions = submissions;
        this.patients = patients;
        this.crypto = crypto;
        this.delivery = delivery;
        this.json = json;
        this.publicUrl = publicUrl;
    }

    @Transactional
    public Created create(String recipient, String channel, LocalDate plannedDate, int hours, String actor) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        QuestionnaireInvitation invitation = invitations.save(new QuestionnaireInvitation(
                crypto.tokenHash(token), crypto.encrypt(recipient), channel, plannedDate,
                Instant.now().plus(Duration.ofHours(hours)), actor));
        String link = publicUrl + (publicUrl.contains("?") ? "&" : "?") + "questionnaireToken=" + token;
        QuestionnaireDeliveryService.Result result = delivery.send(channel, recipient, link);
        invitation.delivery(result.status(), result.message());
        return new Created(invitation, link);
    }

    @Transactional
    public PublicDraft open(String token) {
        QuestionnaireInvitation invitation = find(token);
        invitation.assertUsable();
        invitation.started();
        String draft = invitation.getDraftCipher() == null ? null : crypto.decrypt(invitation.getDraftCipher());
        return new PublicDraft(invitation, draft);
    }

    @Transactional
    public PublicDraft saveDraft(String token, JsonNode payload) {
        QuestionnaireInvitation invitation = find(token);
        LocalDate plannedDate = optionalDate(payload.path("plannedDate").asText(""));
        invitation.saveDraft(crypto.encrypt(payload.toString()), plannedDate);
        return new PublicDraft(invitation, payload.toString());
    }

    @Transactional
    public QuestionnaireSubmission submit(String token, JsonNode payload) {
        QuestionnaireInvitation invitation = find(token);
        invitation.assertUsable();
        String name = required(payload, "name");
        String birth6 = required(payload, "birth6");
        String sex = required(payload, "sex");
        if (!birth6.matches("\\d{6}")) {
            throw new IllegalArgumentException("생년월일은 앞 6자리 숫자로 입력해 주세요.");
        }
        LocalDate plannedDate = optionalDate(payload.path("plannedDate").asText(""));
        if (plannedDate == null) plannedDate = invitation.getPlannedDate();
        if (plannedDate == null) throw new IllegalArgumentException("진료 또는 입원 예정일은 필수입니다.");
        String respondent = payload.path("respondent").asText("본인").trim();

        PdPatient patient = patients.findFirstByNameIndexAndBirth6IndexAndSex(
                        crypto.blindIndex(name), crypto.blindIndex(birth6), sex)
                .orElseGet(() -> patients.save(new PdPatient(name, birth6, sex, crypto)));

        String raw = payload.toString();
        String structured = structured(payload);
        String chart = chart(payload);
        invitation.submitted(plannedDate);
        return submissions.save(new QuestionnaireSubmission(invitation, patient,
                crypto.encrypt(raw), crypto.encrypt(structured), crypto.encrypt(chart), plannedDate, respondent));
    }

    @Transactional(readOnly = true)
    public QuestionnaireInvitation find(String token) {
        return invitations.findByTokenHash(crypto.tokenHash(token))
                .orElseThrow(() -> new NotFoundException("문진 링크를 찾을 수 없습니다."));
    }

    @Transactional(readOnly = true)
    public List<QuestionnaireSubmission> search(String name, String birth6, String sex,
                                                LocalDate plannedDate, String status) {
        return submissions.findTop100ByOrderByCreatedAtDesc().stream()
                .filter(item -> name == null || name.isBlank()
                        || crypto.decrypt(item.getPatient().getNameCipher()).contains(name.trim()))
                .filter(item -> birth6 == null || birth6.isBlank()
                        || crypto.decrypt(item.getPatient().getBirth6Cipher()).equals(birth6.trim()))
                .filter(item -> sex == null || sex.isBlank() || item.getPatient().getSex().equals(sex))
                .filter(item -> plannedDate == null || item.getPlannedDate().equals(plannedDate))
                .filter(item -> status == null || status.isBlank() || item.getStatus().equals(status))
                .toList();
    }

    @Transactional
    public QuestionnaireSubmission review(UUID id, String chart, long version) {
        QuestionnaireSubmission submission = submissions.findById(id)
                .orElseThrow(() -> new NotFoundException("문진을 찾을 수 없습니다."));
        String currentChart = crypto.decrypt(submission.getChartCipher());
        if ("REVIEWED".equals(submission.getStatus()) && currentChart.equals(chart)) {
            return submission;
        }
        if (submission.getVersion() != version) {
            throw new IllegalStateException("다른 사용자가 먼저 문진을 수정했습니다.");
        }
        submission.review(crypto.encrypt(chart));
        return submission;
    }

    public String decrypt(String value) { return crypto.decrypt(value); }

    private String structured(JsonNode payload) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (String field : STRUCTURED_FIELDS) {
            String value = payload.path(field).asText("");
            if (!value.isBlank()) {
                result.put(field, Map.of("value", value, "source", "PATIENT_QUESTIONNAIRE", "rawPreserved", true));
            }
        }
        return json.writeValueAsString(result);
    }

    private String chart(JsonNode payload) {
        StringBuilder text = new StringBuilder("[사전 문진] 환자 설명 — 의료진 확인 필요\n");
        add(text, "작성자", payload, "respondent");
        add(text, "보호자 관계", payload, "relationship");
        add(text, "진료/입원 예정일", payload, "plannedDate");
        add(text, "파킨슨병 발병 시기", payload, "pdOnset");
        add(text, "진단 시기/기관", payload, "pdDiagnosis", "pdDiagnosisHospital");
        add(text, "발병 당시 증상", payload, "initialSymptoms");
        add(text, "발병 측", payload, "onsetSide");
        add(text, "현재 상태", payload, "currentStage");
        add(text, "DBS/수술력", payload, "dbsHistory");
        add(text, "재활치료력", payload, "rehabilitationHistory");
        add(text, "파킨슨병 약", payload, "pdMedication");
        add(text, "복용 시간", payload, "medicationTiming");
        add(text, "약효/소진", payload, "medicationEffect", "wearingOff");
        add(text, "약물 부작용", payload, "medicationSideEffects");
        add(text, "주호소", payload, "chiefComplaint");
        add(text, "증상 상세", payload, "symptomDetail");
        add(text, "발생 시점/측성", payload, "symptomTiming", "laterality");
        add(text, "ON/OFF 및 악화·완화", payload, "onOffRelation", "aggravatingFactors", "relievingFactors");
        add(text, "통증 NRS", payload, "painNrs");
        add(text, "낙상/안전", payload, "fallSafety");
        add(text, "알레르기", payload, "allergy", "foodAllergy", "otherAllergy");
        add(text, "비-PD 복용약", payload, "nonPdMedications");
        add(text, "과거력/가족력", payload, "pastHistory", "familyHistory");
        add(text, "식사/소화", payload, "diet", "digestion");
        add(text, "대변/소변", payload, "bowel", "urine");
        add(text, "수면", payload, "sleep");
        add(text, "Body facts", payload, "bodyFacts");
        add(text, "Brain facts", payload, "brainFacts");
        return text.toString();
    }

    private void add(StringBuilder text, String label, JsonNode payload, String... fields) {
        List<String> values = Arrays.stream(fields).map(field -> payload.path(field).asText(""))
                .filter(value -> !value.isBlank()).toList();
        if (!values.isEmpty()) text.append(label).append(": ").append(String.join(" / ", values)).append('\n');
    }

    private String required(JsonNode node, String key) {
        String value = node.path(key).asText("").trim();
        if (value.isEmpty()) throw new IllegalArgumentException(key + " 항목은 필수입니다.");
        return value;
    }

    private LocalDate optionalDate(String value) {
        if (value == null || value.isBlank()) return null;
        try { return LocalDate.parse(value); }
        catch (DateTimeException exception) { throw new IllegalArgumentException("예정일 형식을 확인해 주세요."); }
    }

    public record Created(QuestionnaireInvitation invitation, String link) { }
    public record PublicDraft(QuestionnaireInvitation invitation, String draftJson) { }
}
