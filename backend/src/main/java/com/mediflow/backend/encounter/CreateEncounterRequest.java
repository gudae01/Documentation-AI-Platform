package com.mediflow.backend.encounter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateEncounterRequest(
        @NotBlank @Size(max = 40) String registrationNumber,
        @NotNull EncounterType type
) {
}
