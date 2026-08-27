package com.mediflow.backend.patient;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record SavePatientRequest(
        @NotBlank @Size(max = 40) String registrationNumber,
        @NotBlank @Size(max = 80) String name,
        @NotBlank @Size(max = 20) String gender,
        @NotNull @PastOrPresent LocalDate birthDate,
        @Size(max = 30) String phone,
        @Size(max = 250) String address,
        @Size(max = 500) String chiefComplaint,
        @Size(max = 500) String allergies,
        @Size(max = 120) String department,
        @Size(max = 50) List<@NotBlank @Size(max = 200) String> diagnoses
) {
}
