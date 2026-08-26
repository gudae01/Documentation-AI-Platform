package com.mediflow.backend.encounter;

import com.mediflow.backend.patient.Patient;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record EncounterResponse(
        UUID id,
        PatientReference patient,
        EncounterType type,
        EncounterStatus status,
        EncounterStep currentStep,
        String chartText,
        String chiefComplaint,
        String symptoms,
        String assessment,
        String plan,
        Soap soap,
        String examinationText,
        Map<String, Object> autonomicTest,
        String autonomicInterpretation,
        boolean recording,
        long recordingSeconds,
        String audioFileName,
        String autonomicFileName,
        String savedDevice,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Instant approvedAt
) {
    public record PatientReference(String registrationNumber, String name) {
        static PatientReference from(Patient patient) {
            return new PatientReference(patient.getId(), patient.getName());
        }
    }

    public record Soap(String subjective, String objective, String assessment, String plan) {
    }
}
