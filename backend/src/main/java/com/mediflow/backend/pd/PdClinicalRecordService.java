package com.mediflow.backend.pd;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.security.SensitiveDataCrypto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class PdClinicalRecordService {
    private final PdClinicalRecordRepository records;
    private final QuestionnaireSubmissionRepository questionnaires;
    private final PdPatientRepository patients;
    private final SensitiveDataCrypto crypto;
    private final ObjectMapper objectMapper;

    public PdClinicalRecordService(PdClinicalRecordRepository records,
                                   QuestionnaireSubmissionRepository questionnaires,
                                   PdPatientRepository patients,
                                   SensitiveDataCrypto crypto,
                                   ObjectMapper objectMapper) {
        this.records = records;
        this.questionnaires = questionnaires;
        this.patients = patients;
        this.crypto = crypto;
        this.objectMapper = objectMapper;
    }

    public PdClinicalRecord approve(UUID questionnaireId, PdClinicalRecordController.ApproveRequest request,
                                    String clinician) {
        return records.findByQuestionnaireId(questionnaireId).orElseGet(() -> {
            QuestionnaireSubmission questionnaire = questionnaires.findById(questionnaireId)
                    .orElseThrow(() -> new NotFoundException("사전 문진을 찾을 수 없습니다."));
            if (!"REVIEWED".equals(questionnaire.getStatus())) {
                questionnaire.review(questionnaire.getChartCipher());
            }
            String payload = write(request);
            return records.save(new PdClinicalRecord(questionnaire.getPatient(), questionnaire,
                    crypto.encrypt(payload), clinician));
        });
    }

    @Transactional(readOnly = true)
    public List<PdClinicalRecord> recent() {
        return records.findTop100ByOrderByApprovedAtDesc();
    }

    @Transactional(readOnly = true)
    public List<PdClinicalRecord> byPatient(UUID patientId) {
        if (!patients.existsById(patientId)) {
            throw new NotFoundException("환자 기록을 찾을 수 없습니다.");
        }
        return records.findByPatientIdOrderByApprovedAtDesc(patientId);
    }

    public PdClinicalRecordController.ApproveRequest read(PdClinicalRecord record) {
        try {
            return objectMapper.readValue(crypto.decrypt(record.getPayloadCipher()),
                    PdClinicalRecordController.ApproveRequest.class);
        } catch (JacksonException exception) {
            throw new IllegalStateException("저장된 진료기록을 읽을 수 없습니다.", exception);
        }
    }

    private String write(PdClinicalRecordController.ApproveRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("진료기록 형식을 저장할 수 없습니다.", exception);
        }
    }
}
