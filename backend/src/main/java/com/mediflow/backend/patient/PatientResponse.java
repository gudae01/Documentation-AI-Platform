package com.mediflow.backend.patient;

import java.time.LocalDate;
import java.util.List;

public record PatientResponse(
        String registrationNumber,
        String name,
        String gender,
        LocalDate birthDate,
        String phone,
        String address,
        LocalDate lastVisit,
        int visitCount,
        String chiefComplaint,
        String allergies,
        String department,
        List<String> diagnoses
) {
    public static PatientResponse from(Patient patient) {
        return new PatientResponse(
                patient.getId(),
                patient.getName(),
                patient.getGender(),
                patient.getBirthDate(),
                patient.getPhone(),
                patient.getAddress(),
                patient.getLastVisit(),
                patient.getVisitCount(),
                patient.getChiefComplaint(),
                patient.getAllergies(),
                patient.getDepartment(),
                patient.getDiagnoses()
        );
    }
}
