package com.mediflow.backend.patient;

import com.mediflow.backend.record.MedicalRecordResponse;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/patients")
public class PatientController {

    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @GetMapping
    public List<PatientResponse> search(
            @RequestParam(defaultValue = "") @Size(max = 100) String query) {
        return patientService.search(query);
    }

    @PostMapping
    public ResponseEntity<PatientResponse> create(@Valid @RequestBody SavePatientRequest request) {
        return ResponseEntity.status(201).body(patientService.create(request));
    }

    @PutMapping("/{registrationNumber}")
    public PatientResponse update(
            @PathVariable @NotBlank @Size(max = 40) String registrationNumber,
            @Valid @RequestBody SavePatientRequest request) {
        return patientService.update(registrationNumber, request);
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
