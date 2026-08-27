package com.mediflow.backend.pd;

import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.security.SensitiveDataCrypto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
public class AdmissionClinicalTestService {
    private static final Set<String> CATEGORIES = Set.of("PEDISOL", "HRV", "LAB", "RADIOLOGY", "PD_SCALE", "OTHER");
    private final AdmissionRecordRepository admissions;
    private final AdmissionClinicalTestRepository tests;
    private final SensitiveDataCrypto crypto;

    public AdmissionClinicalTestService(AdmissionRecordRepository admissions,
                                        AdmissionClinicalTestRepository tests,
                                        SensitiveDataCrypto crypto) {
        this.admissions = admissions;
        this.tests = tests;
        this.crypto = crypto;
    }

    @Transactional
    public TestResponse add(UUID admissionId, LocalDate date, String category, String metric,
                            String value, String unit, String condition, String raw) {
        AdmissionRecord admission = admissions.findById(admissionId)
                .orElseThrow(() -> new NotFoundException("입원 기록을 찾을 수 없습니다."));
        if ("APPROVED".equals(admission.getStatus())) throw new IllegalStateException("승인된 결과에는 검사를 추가할 수 없습니다.");
        String normalizedCategory = category.toUpperCase(Locale.ROOT);
        if (!CATEGORIES.contains(normalizedCategory)) throw new IllegalArgumentException("지원하지 않는 검사 분류입니다.");
        AdmissionClinicalTest saved = tests.save(new AdmissionClinicalTest(admission, date, normalizedCategory,
                crypto.encrypt(metric.trim()), crypto.encrypt(value.trim()), nullable(unit), nullable(condition), nullable(raw)));
        return response(saved);
    }

    @Transactional(readOnly = true)
    public TestBundle bundle(UUID admissionId) {
        if (!admissions.existsById(admissionId)) throw new NotFoundException("입원 기록을 찾을 수 없습니다.");
        List<TestResponse> items = tests.findByAdmissionIdOrderByTestDateAscCreatedAtAsc(admissionId).stream()
                .map(this::response).toList();
        return new TestBundle(items, compare(items));
    }

    private List<TestComparison> compare(List<TestResponse> items) {
        Map<String, List<TestResponse>> groups = new LinkedHashMap<>();
        for (TestResponse item : items) {
            String key = String.join("|", item.category(), item.metric(), value(item.unit()), value(item.condition()));
            groups.computeIfAbsent(key, ignored -> new ArrayList<>()).add(item);
        }
        List<TestComparison> result = new ArrayList<>();
        for (List<TestResponse> group : groups.values()) {
            if (group.size() < 2) continue;
            TestResponse first = group.get(0), last = group.get(group.size() - 1);
            result.add(new TestComparison(last.category(), last.metric(), last.unit(), last.condition(),
                    first.value(), last.value(), delta(first.value(), last.value()), first.testDate(), last.testDate()));
        }
        return result;
    }

    private TestResponse response(AdmissionClinicalTest test) {
        return new TestResponse(test.getId(), test.getTestDate(), test.getCategory(),
                crypto.decrypt(test.getMetricCipher()), crypto.decrypt(test.getValueCipher()),
                decryptNullable(test.getUnitCipher()), decryptNullable(test.getConditionCipher()),
                decryptNullable(test.getRawCipher()), test.getCreatedAt());
    }

    private String nullable(String value) { return value == null || value.isBlank() ? null : crypto.encrypt(value.trim()); }
    private String decryptNullable(String value) { return value == null ? null : crypto.decrypt(value); }
    private String value(String value) { return value == null ? "" : value; }
    private Double delta(String first, String last) {
        try { return Double.parseDouble(last) - Double.parseDouble(first); }
        catch (NumberFormatException ignored) { return null; }
    }

    public record TestResponse(UUID id, LocalDate testDate, String category, String metric, String value,
                               String unit, String condition, String raw, Instant createdAt) { }
    public record TestComparison(String category, String metric, String unit, String condition,
                                 String first, String last, Double delta, LocalDate firstDate,
                                 LocalDate lastDate) { }
    public record TestBundle(List<TestResponse> tests, List<TestComparison> comparisons) { }
}
