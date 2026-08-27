package com.mediflow.backend.encounter;

import com.mediflow.backend.common.ConflictException;
import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.patient.Patient;
import com.mediflow.backend.patient.PatientService;
import com.mediflow.backend.record.MedicalRecord;
import com.mediflow.backend.record.MedicalRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional
public class EncounterService {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() { };

    private final EncounterRepository encounterRepository;
    private final MedicalRecordRepository medicalRecordRepository;
    private final PatientService patientService;
    private final ObjectMapper objectMapper;

    public EncounterService(EncounterRepository encounterRepository,
                            MedicalRecordRepository medicalRecordRepository,
                            PatientService patientService,
                            ObjectMapper objectMapper) {
        this.encounterRepository = encounterRepository;
        this.medicalRecordRepository = medicalRecordRepository;
        this.patientService = patientService;
        this.objectMapper = objectMapper;
    }

    public EncounterResponse create(String ownerKey, CreateEncounterRequest request) {
        Patient patient = patientService.requirePatient(request.registrationNumber());
        EncounterStep firstStep = request.type() == EncounterType.FOLLOW_UP
                ? EncounterStep.PREVIOUS_DATA
                : EncounterStep.PATIENT_CAPTURE;
        Encounter encounter = encounterRepository.save(new Encounter(ownerKey, patient, request.type(), firstStep));
        return response(encounter);
    }

    @Transactional(readOnly = true)
    public EncounterResponse get(String ownerKey, UUID encounterId) {
        return response(requireOwned(encounterId, ownerKey));
    }

    @Transactional(readOnly = true)
    public Optional<EncounterResponse> latestDraft(String ownerKey) {
        return encounterRepository
                .findFirstByOwnerKeyAndStatusOrderByUpdatedAtDesc(ownerKey, EncounterStatus.DRAFT)
                .map(this::response);
    }

    public EncounterResponse saveDraft(String ownerKey, UUID encounterId, SaveDraftRequest request) {
        Encounter encounter = requireOwned(encounterId, ownerKey);
        if (request.version() != null && request.version() != encounter.getVersion()) {
            throw new ConflictException("다른 기기에서 임시저장이 갱신되었습니다. 최신 작업을 다시 불러와 주세요.");
        }

        encounter.saveDraft(
                request.currentStep(), request.chartText(), request.chiefComplaint(), request.symptoms(),
                request.assessment(), request.plan(), request.soapSubjective(), request.soapObjective(),
                request.soapAssessment(), request.soapPlan(), request.examinationText(),
                writeMap(request.autonomicTest()), request.autonomicInterpretation(), request.recording(),
                request.recordingSeconds(), request.audioFileName(), request.autonomicFileName(),
                request.savedDevice()
        );
        encounterRepository.flush();
        return response(encounter);
    }

    public EncounterResponse approve(String ownerKey, UUID encounterId, ApproveEncounterRequest request) {
        Encounter encounter = requireOwned(encounterId, ownerKey);
        encounter.approve();

        MedicalRecord record = new MedicalRecord(
                encounter.getPatient(), LocalDate.now(), encounter.getType(), encounter.getChiefComplaint(),
                encounter.getSymptoms(), encounter.getAssessment(), encounter.getPlan(),
                encounter.getSoapSubjective(), encounter.getSoapObjective(), encounter.getSoapAssessment(),
                encounter.getSoapPlan(), encounter.getExaminationText(), encounter.getAutonomicInterpretation(),
                encounter.getAutonomicTestJson(), request.clinician(), Instant.now(), encounter.getId()
        );
        medicalRecordRepository.save(record);
        encounter.getPatient().registerApprovedVisit(LocalDate.now(), encounter.getChiefComplaint());
        encounterRepository.flush();
        return response(encounter);
    }

    public Encounter requireOwned(UUID encounterId, String ownerKey) {
        return encounterRepository.findByIdAndOwnerKey(encounterId, ownerKey)
                .orElseThrow(() -> new NotFoundException("진료 작업을 찾을 수 없습니다."));
    }

    private EncounterResponse response(Encounter encounter) {
        return new EncounterResponse(
                encounter.getId(), EncounterResponse.PatientReference.from(encounter.getPatient()),
                encounter.getType(), encounter.getStatus(), encounter.getCurrentStep(), encounter.getChartText(),
                encounter.getChiefComplaint(), encounter.getSymptoms(), encounter.getAssessment(),
                encounter.getPlan(), new EncounterResponse.Soap(encounter.getSoapSubjective(),
                encounter.getSoapObjective(), encounter.getSoapAssessment(), encounter.getSoapPlan()),
                encounter.getExaminationText(), readMap(encounter.getAutonomicTestJson()),
                encounter.getAutonomicInterpretation(), encounter.isRecording(), encounter.getRecordingSeconds(),
                encounter.getAudioFileName(), encounter.getAutonomicFileName(), encounter.getSavedDevice(),
                encounter.getVersion(), encounter.getCreatedAt(), encounter.getUpdatedAt(), encounter.getApprovedAt()
        );
    }

    private String writeMap(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("자율신경검사 데이터 형식을 확인해 주세요.", exception);
        }
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
