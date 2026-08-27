package com.mediflow.backend.record;

import com.mediflow.backend.encounter.EncounterType;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.List;
import java.util.Map;
import com.mediflow.backend.attachment.AttachmentResponse;

public record MedicalRecordResponse(
        UUID id,
        LocalDate visitDate,
        EncounterType visitType,
        String chiefComplaint,
        String symptoms,
        String assessment,
        String plan,
        SoapResponse soap,
        String examinationText,
        Map<String, Object> autonomicTest,
        String autonomicInterpretation,
        List<AttachmentResponse> attachments,
        String clinician,
        Instant approvedAt,
        UUID sourceEncounterId
) {
    public record SoapResponse(String subjective, String objective, String assessment, String plan) {
    }

    public static MedicalRecordResponse from(MedicalRecord record, Map<String, Object> autonomicTest,
                                             List<AttachmentResponse> attachments) {
        return new MedicalRecordResponse(
                record.getId(),
                record.getVisitDate(),
                record.getVisitType(),
                record.getChiefComplaint(),
                record.getSymptoms(),
                record.getAssessment(),
                record.getPlan(),
                new SoapResponse(record.getSoapSubjective(), record.getSoapObjective(), record.getSoapAssessment(), record.getSoapPlan()),
                record.getExaminationText(),
                autonomicTest,
                record.getAutonomicInterpretation(),
                attachments,
                record.getClinician(),
                record.getApprovedAt(),
                record.getSourceEncounterId()
        );
    }
}
