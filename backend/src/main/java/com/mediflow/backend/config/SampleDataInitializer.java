package com.mediflow.backend.config;

import com.mediflow.backend.encounter.EncounterType;
import com.mediflow.backend.patient.Patient;
import com.mediflow.backend.patient.PatientRepository;
import com.mediflow.backend.record.MedicalRecord;
import com.mediflow.backend.record.MedicalRecordRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Configuration
@Profile("!test")
public class SampleDataInitializer {

    @Bean
    CommandLineRunner seedSampleData(PatientRepository patients, MedicalRecordRepository records) {
        return args -> {
            if (patients.count() > 0) {
                return;
            }

            Patient kim = new Patient(
                    "P-2024-01842", "김민준", "남", LocalDate.of(1979, 3, 18),
                    "010-1234-5678", "서울특별시 중구", LocalDate.of(2026, 8, 12), 8,
                    "만성 피로와 수면장애", "페니실린", "한방내과",
                    List.of("자율신경 기능 이상", "수면장애"));
            Patient lee = new Patient(
                    "P-2025-00671", "이서연", "여", LocalDate.of(1992, 6, 4),
                    "010-2451-8092", "서울특별시 마포구", LocalDate.of(2026, 7, 28), 3,
                    "어지럼증", "없음", "한방내과", List.of("어지럼증"));
            Patient park = new Patient(
                    "P-2023-03109", "박지훈", "남", LocalDate.of(1968, 11, 21),
                    "010-9381-2274", "경기도 성남시", LocalDate.of(2026, 8, 2), 12,
                    "혈압 추적 관찰", "없음", "한방내과", List.of("고혈압"));
            Patient choi = new Patient(
                    "P-2025-01426", "최유진", "여", LocalDate.of(1984, 1, 9),
                    "010-6173-4408", "서울특별시 강남구", LocalDate.of(2026, 7, 15), 2,
                    "소화불량과 복부 팽만", "없음", "한방내과", List.of("기능성 소화불량"));
            patients.saveAll(List.of(kim, lee, park, choi));

            records.save(new MedicalRecord(
                    kim, LocalDate.of(2026, 8, 12), EncounterType.FOLLOW_UP,
                    "만성 피로와 수면장애",
                    "최근 3개월 동안 쉽게 잠들지 못하고 아침 피로가 지속됨. 업무 스트레스가 심한 날 증상이 악화됨.",
                    "위험 신호나 급성 신경학적 이상은 확인되지 않음. 수면장애와 지속적인 스트레스가 자율신경 불균형에 영향을 주는 것으로 판단함.",
                    "수면위생 교육, 카페인 섭취 조절, 규칙적인 유산소 운동. 4주 후 증상과 자율신경검사 변화 재평가.",
                    "최근 3개월간 수면장애와 아침 피로가 지속되고 스트레스가 심한 날 악화됨.",
                    "혈압 128/82 mmHg. HRV 32 ms, LF/HF 2.41, 스트레스 지수 78.",
                    "수면장애 및 스트레스 연관 자율신경 불균형 경과 관찰.",
                    "수면위생 교육, 카페인 섭취 조절. 4주 후 재평가.",
                    "혈압 128/82 mmHg\nHRV 32 ms\nLF/HF 2.41\n스트레스 지수 78",
                    "이전 검사보다 HRV가 증가하고 LF/HF 및 스트레스 지수가 감소해 전반적으로 호전됨.",
                    "홍길동", Instant.parse("2026-08-12T07:30:00Z"), UUID.randomUUID()));

            records.save(new MedicalRecord(
                    kim, LocalDate.of(2026, 5, 2), EncounterType.FOLLOW_UP,
                    "피로와 입면 지연", "밤에 잠드는 데 1시간 이상 걸리며 낮 동안 피로함.",
                    "스트레스 관련 수면장애 의심.", "생활 습관 교정 후 추적 관찰.",
                    "입면 지연과 낮 피로.", "HRV 28 ms, LF/HF 2.88, 스트레스 지수 84.",
                    "스트레스 연관 자율신경 불균형.", "수면위생 교육.",
                    "HRV 28 ms\nLF/HF 2.88\n스트레스 지수 84",
                    "기준 검사로 이후 검사와 비교가 필요함.",
                    "홍길동", Instant.parse("2026-05-02T06:10:00Z"), UUID.randomUUID()));
        };
    }
}
