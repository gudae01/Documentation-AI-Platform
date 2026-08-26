package com.mediflow.backend.encounter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ApproveEncounterRequest(
        @NotBlank @Size(max = 80) String clinician
) {
}
