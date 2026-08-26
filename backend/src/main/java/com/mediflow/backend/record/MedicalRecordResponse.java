package com.mediflow.backend.record;

import com.mediflow.backend.encounter.EncounterType;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

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
        String autonomicInterpretation,
        String clinician,
        Instant approvedAt,
        UUID sourceEncounterId
) {
    public record SoapResponse(String subjective, String objective, String assessment, String plan) {
    }

    public static MedicalRecordResponse from(MedicalRecord record) {
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
                record.getAutonomicInterpretation(),
                record.getClinician(),
                record.getApprovedAt(),
                record.getSourceEncounterId()
        );
    }
}
