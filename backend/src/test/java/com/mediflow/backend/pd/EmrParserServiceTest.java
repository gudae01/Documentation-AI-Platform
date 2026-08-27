package com.mediflow.backend.pd;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class EmrParserServiceTest {
    private final EmrParserService parser = new EmrParserService();

    @Test
    void preservesSubjectiveAndUsesSecondArrowValueAsCurrent() {
        String raw = "2026-08-25\t09:00\tS/O\t# 보행 NRS7 -> NRS6\n- 다리가 말을 안 들어요\n- 보행 시 흔들림 관찰\n식사) 1/2공기\n소화) 양호\n대변) 1회\n소변) 양호\n수면) 5시간\n";
        var parsed = parser.parse(raw);
        var observation = parsed.entries().get(0).observations().get(0);
        assertThat(observation.previous()).isEqualTo("7");
        assertThat(observation.current()).isEqualTo("6");
        assertThat(observation.subjective()).isEqualTo("다리가 말을 안 들어요");
        assertThat(parsed.entries().get(0).dailyLiving()).containsKey("식사").containsKey("수면");
    }

    @Test
    void parsesSingleScoreMedicationPiAndDischargeSummary() {
        String raw = "2026-07-13\t12:00\t특이사항\t<<DISCHARGE SUMMARY>>\n"
                + "1) Hosp.Days: 2026-07-06 ~ 2026-07-13 (8days)\n3) C/C\n1. Rigidity -> Improving\n"
                + "4) D/C med : none\n5) Treatment : A-Tx\n<<DISCHARGED>>\n"
                + "2026-07-13\t07:00\tS/O\t# Rigidity NRS6\n- 오늘은 괜찮아요\n- 간헐적\n"
                + "2026-07-13\t\t첩약\t평진건비탕 총첩수 : 2 횟수 : 2\n"
                + "2026-07-06\t12:50\tP/I\t1. Parkinsons disease[O/S(Rt. or Lt.):2019년경][H&Y:2][LEDD:450mg][DBS:N]";
        var parsed = parser.parse(raw);
        assertThat(parsed.entries().stream().flatMap(entry -> entry.observations().stream()).findFirst().orElseThrow().current())
                .isEqualTo("6");
        assertThat(parsed.medications()).singleElement().satisfies(medication ->
                assertThat(medication.name()).isEqualTo("평진건비탕"));
        assertThat(parsed.parkinsonsHistory()).containsEntry("H&Y", "2").containsEntry("DBS", "N");
        assertThat(parsed.discharge().chiefComplaints()).singleElement().satisfies(outcome ->
                assertThat(outcome.outcome()).isEqualTo("Improving"));
    }

    @Test
    void comparesOnlySameSymptomAndScale() {
        String raw = "2026-08-20\t09:00\t경과기록\t# 보행 NRS8 -> NRS7\n- 처음\n- 관찰\n"
                + "2026-08-25\t09:00\t경과기록\t# 보행 NRS7 -> NRS5\n- 이후\n- 관찰\n";
        var comparison = parser.parse(raw).comparisons().get(0);
        assertThat(comparison.first()).isEqualTo("7");
        assertThat(comparison.last()).isEqualTo("5");
        assertThat(comparison.delta()).isEqualTo(-2.0);
    }
}
