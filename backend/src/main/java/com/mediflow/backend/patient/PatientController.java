package com.mediflow.backend.patient;

import com.mediflow.backend.record.MedicalRecordResponse;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/patients")
public class PatientController {

    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @GetMapping("/{registrationNumber}")
    public PatientResponse getByRegistrationNumber(
            @PathVariable @NotBlank @Size(max = 40) String registrationNumber) {
        return patientService.findByRegistrationNumber(registrationNumber);
    }

    @GetMapping("/{registrationNumber}/records")
    public List<MedicalRecordResponse> records(
            @PathVariable @NotBlank @Size(max = 40) String registrationNumber) {
        return patientService.records(registrationNumber);
    }
}
