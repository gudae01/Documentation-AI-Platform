package com.mediflow.backend.pd;

import com.mediflow.backend.security.SensitiveDataCrypto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ReportAndAttachmentIntegrationTest {
    @Autowired ReportPdfService pdfService;
    @Autowired AdmissionAttachmentService attachmentService;
    @Autowired AdmissionAttachmentRepository attachments;
    @Autowired AdmissionRecordRepository admissions;
    @Autowired PdPatientRepository patients;
    @Autowired SensitiveDataCrypto crypto;
    @Autowired AdmissionClinicalTestService clinicalTestService;
    @Autowired AdmissionClinicalTestRepository clinicalTests;

    @Test
    void createsKoreanPdf() {
        byte[] pdf = pdfService.create("파킨슨병 입원 결과보고서\n\n[환자 설명]\n오늘은 몸이 편안해요.");
        assertThat(new String(pdf, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
        assertThat(pdf.length).isGreaterThan(1_000);
    }

    @Test
    void encryptsAdmissionAttachmentAtRestAndDownloadsOriginal() {
        PdPatient patient = patients.save(new PdPatient("테스트", "800101", "M", crypto));
        AdmissionRecord admission = admissions.save(new AdmissionRecord(patient, crypto.encrypt("raw"),
                crypto.encrypt("{}"), crypto.encrypt("report")));
        MockMultipartFile file = new MockMultipartFile("file", "result.txt", "text/plain",
                "민감 검사 결과".getBytes(StandardCharsets.UTF_8));
        var response = attachmentService.upload(admission.getId(), file);
        AdmissionAttachment stored = attachments.findById(response.id()).orElseThrow();
        assertThat(stored.getContentCipher()).doesNotContain("민감 검사 결과");
        assertThat(new String(attachmentService.download(admission.getId(), response.id()).content(),
                StandardCharsets.UTF_8)).isEqualTo("민감 검사 결과");
    }

    @Test
    void comparesOnlyMatchingManualTestConditionsAndEncryptsValues() {
        PdPatient patient = patients.save(new PdPatient("검사", "700101", "F", crypto));
        AdmissionRecord admission = admissions.save(new AdmissionRecord(patient, crypto.encrypt("raw"),
                crypto.encrypt("{}"), crypto.encrypt("report")));
        clinicalTestService.add(admission.getId(), LocalDate.of(2026, 8, 1), "HRV", "SDNN", "20", "ms", "REST", "원문1");
        clinicalTestService.add(admission.getId(), LocalDate.of(2026, 8, 8), "HRV", "SDNN", "27", "ms", "REST", "원문2");
        var bundle = clinicalTestService.bundle(admission.getId());
        assertThat(bundle.comparisons()).singleElement().satisfies(comparison ->
                assertThat(comparison.delta()).isEqualTo(7.0));
        assertThat(clinicalTests.findByAdmissionIdOrderByTestDateAscCreatedAtAsc(admission.getId()).get(0)
                .getValueCipher()).doesNotContain("20");
    }
}
