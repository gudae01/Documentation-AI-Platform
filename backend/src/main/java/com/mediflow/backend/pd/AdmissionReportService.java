package com.mediflow.backend.pd;

import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AdmissionReportService {
    public String generate(String patientName, EmrParserService.Parsed parsed) {
        StringBuilder report = new StringBuilder();
        report.append("파킨슨병 입원 결과보고서\n");
        report.append("환자: ").append(patientName).append('\n');
        if (parsed.encounter() != null) {
            report.append("입원 기간: ").append(value(parsed.encounter().admitDate()))
                    .append(" ~ ").append(value(parsed.encounter().dischargeDate()));
            if (parsed.encounter().days() != null) report.append(" (").append(parsed.encounter().days()).append("일)");
            report.append("\n");
        }
        report.append("\n[환자 설명]\n");
        boolean hasSubjective = false;
        for (EmrParserService.Entry entry : parsed.entries()) {
            for (EmrParserService.Observation observation : entry.observations()) {
                if (!observation.subjective().isBlank()) {
                    report.append(entry.date()).append(" · ").append(observation.symptom())
                            .append(": ").append(observation.subjective()).append('\n');
                    hasSubjective = true;
                }
            }
        }
        if (!hasSubjective) report.append("기록된 환자 설명 없음\n");

        report.append("\n[증상 경과 — 기록값 비교]\n");
        if (parsed.comparisons().isEmpty()) report.append("비교 가능한 동일 증상·척도 기록 없음\n");
        for (EmrParserService.Comparison comparison : parsed.comparisons()) {
            report.append(comparison.symptom()).append(" ").append(comparison.scale()).append(": ")
                    .append(comparison.first()).append(" (").append(comparison.firstDate()).append(") → ")
                    .append(comparison.last()).append(" (").append(comparison.lastDate()).append(")\n");
        }

        report.append("\n[일상생활 기록]\n");
        parsed.entries().stream().filter(entry -> !entry.dailyLiving().isEmpty()).forEach(entry -> {
            report.append(entry.date()).append('\n');
            entry.dailyLiving().values().forEach(item -> report.append("- ").append(item).append('\n'));
        });

        report.append("\n[검사 결과]\n");
        if (parsed.tests().isEmpty()) report.append("구조화된 검사 결과 없음\n");
        for (EmrParserService.TestResult test : parsed.tests()) {
            report.append(test.date()).append(" · ").append(test.panel()).append(" · ")
                    .append(test.metric()).append(": ").append(test.value());
            if (test.unit() != null) report.append(" ").append(test.unit());
            if (test.flag() != null) report.append(" [").append(test.flag()).append("]");
            report.append('\n');
        }
        for (EmrParserService.TestComparison comparison : parsed.testComparisons()) {
            report.append("비교: ").append(comparison.panel()).append("/").append(comparison.metric())
                    .append(" ").append(comparison.first()).append(" → ").append(comparison.last()).append('\n');
        }

        report.append("\n[입원 중 처방]\n");
        if (parsed.medications().isEmpty()) report.append("구조화된 처방 기록 없음\n");
        for (EmrParserService.Medication medication : parsed.medications()) {
            report.append(medication.date()).append(" · ").append(medication.type()).append(" · ")
                    .append(medication.name()).append(" ").append(medication.amounts()).append('\n');
        }

        if (parsed.discharge() != null) {
            report.append("\n[퇴원요약]\n");
            for (EmrParserService.ChiefOutcome outcome : parsed.discharge().chiefComplaints()) {
                report.append(outcome.rank()).append(". ").append(outcome.name());
                if (outcome.outcome() != null) report.append(" → ").append(outcome.outcome());
                report.append('\n');
            }
            if (!parsed.discharge().treatment().isBlank()) {
                report.append("치료: ").append(parsed.discharge().treatment()).append('\n');
            }
        }

        report.append("\n[의료진 최종 작성]\n");
        report.append("종합판단:\n치료계획:\n생활관리:\n재내원 권고:\n");
        report.append("\n※ 본 문서는 명시된 원자료를 규칙 기반으로 정리한 검토 초안입니다. 의료진 최종 확인이 필요합니다.\n");
        return report.toString();
    }

    public String includeManualTests(String report, AdmissionClinicalTestService.TestBundle bundle) {
        if (bundle.tests().isEmpty()) return report;
        String marker = "\n[의료진 최종 작성]\n";
        int position = report.indexOf(marker);
        StringBuilder section = new StringBuilder("\n[추가 검사 결과]\n");
        for (AdmissionClinicalTestService.TestResponse test : bundle.tests()) {
            section.append(test.testDate()).append(" · ").append(test.category()).append(" · ")
                    .append(test.metric()).append(": ").append(test.value());
            if (test.unit() != null) section.append(" ").append(test.unit());
            if (test.condition() != null) section.append(" (").append(test.condition()).append(")");
            section.append('\n');
        }
        for (AdmissionClinicalTestService.TestComparison comparison : bundle.comparisons()) {
            section.append("비교: ").append(comparison.category()).append(" · ").append(comparison.metric())
                    .append(" ").append(comparison.first()).append(" (").append(comparison.firstDate()).append(") → ")
                    .append(comparison.last()).append(" (").append(comparison.lastDate()).append(")\n");
        }
        return position < 0 ? report + section : report.substring(0, position) + section + report.substring(position);
    }

    private String value(String value) { return value == null ? "미기록" : value; }
}
