package com.mediflow.backend.patient;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.common.ConflictException;
import com.mediflow.backend.attachment.AttachmentResponse;
import com.mediflow.backend.attachment.EncounterAttachment;
import com.mediflow.backend.attachment.EncounterAttachmentRepository;
import com.mediflow.backend.record.MedicalRecordRepository;
import com.mediflow.backend.record.MedicalRecordResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional(readOnly = true)
public class PatientService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };

    private final PatientRepository patientRepository;
    private final MedicalRecordRepository medicalRecordRepository;
    private final EncounterAttachmentRepository attachmentRepository;
    private final ObjectMapper objectMapper;

    public PatientService(PatientRepository patientRepository, MedicalRecordRepository medicalRecordRepository,
                          EncounterAttachmentRepository attachmentRepository, ObjectMapper objectMapper) {
        this.patientRepository = patientRepository;
        this.medicalRecordRepository = medicalRecordRepository;
        this.attachmentRepository = attachmentRepository;
        this.objectMapper = objectMapper;
    }

    public List<PatientResponse> search(String query) {
        String normalizedQuery = query == null ? "" : query.trim();
        return patientRepository.search(normalizedQuery).stream()
                .limit(200)
                .map(PatientResponse::from)
                .toList();
    }

    @Transactional
    public PatientResponse create(SavePatientRequest request) {
        String registrationNumber = normalize(request.registrationNumber());
        if (patientRepository.existsById(registrationNumber)) {
            throw new ConflictException("이미 등록된 환자 등록번호입니다.");
        }
        Patient patient = new Patient(
                registrationNumber, cleanRequired(request.name()), cleanRequired(request.gender()),
                request.birthDate(), clean(request.phone()), clean(request.address()), null, 0,
                clean(request.chiefComplaint()), defaultAllergies(request.allergies()),
                clean(request.department()), cleanDiagnoses(request.diagnoses()));
        return PatientResponse.from(patientRepository.save(patient));
    }

    @Transactional
    public PatientResponse update(String registrationNumber, SavePatientRequest request) {
        String normalizedPath = normalize(registrationNumber);
        if (!normalizedPath.equals(normalize(request.registrationNumber()))) {
            throw new IllegalArgumentException("환자 등록번호는 변경할 수 없습니다.");
        }
        Patient patient = requirePatient(normalizedPath);
        patient.updateDetails(
                cleanRequired(request.name()), cleanRequired(request.gender()), request.birthDate(),
                clean(request.phone()), clean(request.address()), clean(request.chiefComplaint()),
                defaultAllergies(request.allergies()), clean(request.department()),
                cleanDiagnoses(request.diagnoses()));
        return PatientResponse.from(patient);
    }

    public PatientResponse findByRegistrationNumber(String registrationNumber) {
        return PatientResponse.from(requirePatient(registrationNumber));
    }

    public List<MedicalRecordResponse> records(String registrationNumber) {
        requirePatient(registrationNumber);
        var records = medicalRecordRepository.findByPatientIdOrderByVisitDateDescApprovedAtDesc(
                normalize(registrationNumber));
        Set<UUID> encounterIds = records.stream().map(record -> record.getSourceEncounterId())
                .collect(Collectors.toSet());
        Map<UUID, List<EncounterAttachment>> attachments = encounterIds.isEmpty()
                ? Map.of()
                : attachmentRepository.findByEncounterIdInOrderByCreatedAtAsc(encounterIds).stream()
                        .collect(Collectors.groupingBy(attachment -> attachment.getEncounter().getId()));
        return records.stream().map(record -> MedicalRecordResponse.from(
                        record,
                        readMap(record.getAutonomicTestJson()),
                        attachments.getOrDefault(record.getSourceEncounterId(), List.of()).stream()
                                .map(AttachmentResponse::from).toList()))
                .toList();
    }

    public Patient requirePatient(String registrationNumber) {
        return patientRepository.findByRegistrationNumber(normalize(registrationNumber))
                .orElseThrow(() -> new NotFoundException("해당 환자 등록번호를 찾을 수 없습니다."));
    }

    private String normalize(String registrationNumber) {
        return registrationNumber == null ? "" : registrationNumber.trim().toUpperCase();
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String cleanRequired(String value) {
        return value.trim();
    }

    private String defaultAllergies(String value) {
        String cleaned = clean(value);
        return cleaned == null ? "미확인" : cleaned;
    }

    private List<String> cleanDiagnoses(List<String> diagnoses) {
        if (diagnoses == null) {
            return List.of();
        }
        return diagnoses.stream().map(this::clean).filter(value -> value != null).distinct().toList();
    }

    private Map<String, Object> readMap(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(value, MAP_TYPE);
        } catch (JacksonException exception) {
            throw new IllegalStateException("저장된 자율신경검사 데이터를 읽을 수 없습니다.", exception);
        }
    }
}
