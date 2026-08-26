package com.mediflow.backend.patient;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.record.MedicalRecordRepository;
import com.mediflow.backend.record.MedicalRecordResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class PatientService {

    private final PatientRepository patientRepository;
    private final MedicalRecordRepository medicalRecordRepository;

    public PatientService(PatientRepository patientRepository, MedicalRecordRepository medicalRecordRepository) {
        this.patientRepository = patientRepository;
        this.medicalRecordRepository = medicalRecordRepository;
    }

    public PatientResponse findByRegistrationNumber(String registrationNumber) {
        return PatientResponse.from(requirePatient(registrationNumber));
    }

    public List<MedicalRecordResponse> records(String registrationNumber) {
        requirePatient(registrationNumber);
        return medicalRecordRepository.findByPatientIdOrderByVisitDateDescApprovedAtDesc(registrationNumber)
                .stream()
                .map(MedicalRecordResponse::from)
                .toList();
    }

    public Patient requirePatient(String registrationNumber) {
        return patientRepository.findByRegistrationNumber(normalize(registrationNumber))
                .orElseThrow(() -> new NotFoundException("해당 환자 등록번호를 찾을 수 없습니다."));
    }

    private String normalize(String registrationNumber) {
        return registrationNumber == null ? "" : registrationNumber.trim().toUpperCase();
    }
}
