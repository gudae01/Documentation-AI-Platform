package com.mediflow.backend.encounter;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.Map;

public record SaveDraftRequest(
        @NotNull EncounterStep currentStep,
        @Size(max = 100_000) String chartText,
        @Size(max = 500) String chiefComplaint,
        @Size(max = 100_000) String symptoms,
        @Size(max = 100_000) String assessment,
        @Size(max = 100_000) String plan,
        @Size(max = 100_000) String soapSubjective,
        @Size(max = 100_000) String soapObjective,
        @Size(max = 100_000) String soapAssessment,
        @Size(max = 100_000) String soapPlan,
        @Size(max = 100_000) String examinationText,
        Map<String, Object> autonomicTest,
        @Size(max = 100_000) String autonomicInterpretation,
        boolean recording,
        @PositiveOrZero long recordingSeconds,
        @Size(max = 255) String audioFileName,
        @Size(max = 255) String autonomicFileName,
        @Size(max = 100) String savedDevice,
        Long version
) {
}
