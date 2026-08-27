package com.mediflow.backend.pd;

import com.mediflow.backend.audit.AuditService;
import com.mediflow.backend.common.NotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@RestController
public class QuestionnaireController {
    private final QuestionnaireService service;
    private final QuestionnaireInvitationRepository invitations;
    private final AuditService audit;

    public QuestionnaireController(QuestionnaireService service,
                                   QuestionnaireInvitationRepository invitations,
                                   AuditService audit) {
        this.service = service;
        this.invitations = invitations;
        this.audit = audit;
    }

    @PostMapping("/api/pd/questionnaire-invitations")
    @PreAuthorize("hasRole('CLINICIAN')")
    public InviteResponse create(@Valid @RequestBody CreateInvite request, Authentication authentication,
                                 HttpServletRequest servletRequest) {
        QuestionnaireService.Created created = service.create(request.recipient(), request.channel(),
                request.plannedDate(), request.expiresInHours(), authentication.getName());
        audit.record(authentication, servletRequest, "CREATE_AND_SEND", "QUESTIONNAIRE_INVITATION",
                created.invitation().getId());
        return InviteResponse.from(created.invitation(), created.link());
    }

    @GetMapping("/api/pd/questionnaire-invitations")
    @PreAuthorize("hasRole('CLINICIAN')")
    public List<InviteResponse> invitations() {
        return invitations.findTop100ByOrderByCreatedAtDesc().stream()
                .map(item -> InviteResponse.from(item, null)).toList();
    }

    @DeleteMapping("/api/pd/questionnaire-invitations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasRole('CLINICIAN')")
    public void revoke(@PathVariable UUID id, Authentication authentication,
                       HttpServletRequest servletRequest) {
        QuestionnaireInvitation invitation = invitations.findById(id)
                .orElseThrow(() -> new NotFoundException("문진 링크를 찾을 수 없습니다."));
        invitation.revoke();
        invitations.save(invitation);
        audit.record(authentication, servletRequest, "REVOKE", "QUESTIONNAIRE_INVITATION", id);
    }

    @GetMapping("/api/public/questionnaires/{token}")
    public PublicMeta open(@PathVariable String token, HttpServletRequest servletRequest) {
        QuestionnaireService.PublicDraft opened = service.open(token);
        audit.record("PUBLIC", servletRequest, "OPEN", "QUESTIONNAIRE", opened.invitation().getId(), true);
        return new PublicMeta(opened.invitation().getExpiresAt(), opened.invitation().getPlannedDate(),
                opened.draftJson(), opened.invitation().getDraftSavedAt());
    }

    @PutMapping("/api/public/questionnaires/{token}/draft")
    public PublicMeta draft(@PathVariable String token, @RequestBody JsonNode payload,
                            HttpServletRequest servletRequest) {
        QuestionnaireService.PublicDraft saved = service.saveDraft(token, payload);
        audit.record("PUBLIC", servletRequest, "SAVE_DRAFT", "QUESTIONNAIRE",
                saved.invitation().getId(), true);
        return new PublicMeta(saved.invitation().getExpiresAt(), saved.invitation().getPlannedDate(),
                saved.draftJson(), saved.invitation().getDraftSavedAt());
    }

    @PostMapping("/api/public/questionnaires/{token}/submit")
    public SubmitResponse submit(@PathVariable String token, @RequestBody JsonNode payload,
                                 HttpServletRequest servletRequest) {
        QuestionnaireSubmission submission = service.submit(token, payload);
        audit.record("PUBLIC", servletRequest, "SUBMIT", "QUESTIONNAIRE", submission.getId(), true);
        return new SubmitResponse(submission.getId(), submission.getStatus(), submission.getCreatedAt());
    }

    @GetMapping("/api/pd/questionnaires")
    @PreAuthorize("hasRole('CLINICIAN')")
    public List<SubmissionResponse> list(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String birth6,
            @RequestParam(required = false) String sex,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate plannedDate,
            @RequestParam(required = false) String status,
            Authentication authentication, HttpServletRequest servletRequest) {
        List<SubmissionResponse> result = service.search(name, birth6, sex, plannedDate, status).stream()
                .map(this::response).toList();
        audit.record(authentication, servletRequest, "SEARCH", "QUESTIONNAIRE", null);
        return result;
    }

    @PutMapping("/api/pd/questionnaires/{id}/review")
    @PreAuthorize("hasRole('CLINICIAN')")
    public SubmissionResponse review(@PathVariable UUID id, @Valid @RequestBody Review request,
                                     Authentication authentication, HttpServletRequest servletRequest) {
        QuestionnaireSubmission submission = service.review(id, request.chart(), request.version());
        audit.record(authentication, servletRequest, "REVIEW", "QUESTIONNAIRE", id);
        return response(submission);
    }

    private SubmissionResponse response(QuestionnaireSubmission submission) {
        return new SubmissionResponse(submission.getId(), submission.getPatient().getId(),
                service.decrypt(submission.getPatient().getNameCipher()),
                service.decrypt(submission.getPatient().getBirth6Cipher()),
                submission.getPatient().getSex(), submission.getPlannedDate(), submission.getRespondentType(),
                service.decrypt(submission.getPayloadCipher()), service.decrypt(submission.getStructuredCipher()),
                service.decrypt(submission.getChartCipher()), submission.getStatus(), submission.getCreatedAt(),
                submission.getReviewedAt(), submission.getVersion());
    }

    public record CreateInvite(
            @NotBlank @Size(max = 120) String recipient,
            @Pattern(regexp = "SMS|KAKAO|EMAIL") String channel,
            @NotNull LocalDate plannedDate,
            @Min(1) @Max(168) int expiresInHours) { }

    public record Review(@NotBlank @Size(max = 30000) String chart, @PositiveOrZero long version) { }

    public record PublicMeta(Instant expiresAt, LocalDate plannedDate, String draftJson,
                             Instant draftSavedAt) { }

    public record SubmitResponse(UUID id, String status, Instant submittedAt) { }

    public record InviteResponse(UUID id, String channel, String status, String deliveryStatus,
                                 String deliveryMessage, LocalDate plannedDate, Instant expiresAt,
                                 Instant createdAt, String link) {
        static InviteResponse from(QuestionnaireInvitation invitation, String link) {
            return new InviteResponse(invitation.getId(), invitation.getChannel(),
                    invitation.getStatus().name(), invitation.getDeliveryStatus().name(),
                    invitation.getDeliveryMessage(), invitation.getPlannedDate(), invitation.getExpiresAt(),
                    invitation.getCreatedAt(), link);
        }
    }

    public record SubmissionResponse(UUID id, UUID patientId, String name, String birth6, String sex,
                                     LocalDate plannedDate, String respondentType, String rawJson,
                                     String structuredJson, String chart, String status, Instant submittedAt,
                                     Instant reviewedAt, long version) { }
}
