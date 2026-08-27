package com.mediflow.backend.pd;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class EmrParserService {
    private static final Pattern RECORD = Pattern.compile(
            "(?m)^(\\d{4}-\\d{2}-\\d{2})\\t([^\\t\\r\\n]*)\\t([^\\t\\r\\n]+)\\t");
    private static final Pattern SCORE = Pattern.compile(
            "(?i)(NRS|Gr\\.?|MMT)\\s*([IVX]+|\\d+(?:\\.\\d+)?)" +
                    "(?:\\s*(?:->|→)\\s*(?:NRS|Gr\\.?|MMT)?\\s*([IVX]+|\\d+(?:\\.\\d+)?))?");
    private static final Pattern PI_BRACKET = Pattern.compile("\\[([^\\]:]+(?:\\([^]]*\\))?):\\s*([^]]*)]");
    private static final Pattern MED_NUMBER = Pattern.compile("(총첩수|일총량|횟수|일수)\\s*:\\s*([\\d.]+)");
    private static final Pattern HOSPITAL_DAYS = Pattern.compile(
            "Hosp\\.Days:\\s*(\\d{4}-\\d{2}-\\d{2})\\s*~\\s*(\\d{4}-\\d{2}-\\d{2})\\s*\\((\\d+)days\\)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DISCHARGE_CC = Pattern.compile(
            "(?m)^\\s*(\\d+)\\.\\s*([^\\r\\n]+?)(?:\\s*->\\s*([^\\r\\n]+))?\\s*$");
    private static final Pattern TEST_LINE = Pattern.compile(
            "^(.+?)\\s{2,}([+-]?\\d+(?:\\.\\d+)?|Positive|Negative|WNL)" +
                    "(?:\\s+([^\\s]+))?(?:\\s+([HL]))?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern VITAL = Pattern.compile(
            "v/s[:\\s]*([0-9]+)/([0-9]+)-([0-9]+)/([0-9]+)/([0-9.]+)", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter DOT_DATE = DateTimeFormatter.ofPattern("yyyy.MM.dd");

    public Parsed parse(String raw) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException("EMR 원문을 입력해 주세요.");
        List<Entry> entries = split(raw);
        if (entries.isEmpty()) {
            throw new IllegalArgumentException("EMR 형식은 날짜<TAB>시간<TAB>종류<TAB>내용이어야 합니다.");
        }

        List<Medication> medications = new ArrayList<>();
        List<TestResult> tests = new ArrayList<>();
        List<ClinicalEvent> events = new ArrayList<>();
        Map<String, String> initial = new LinkedHashMap<>();
        Map<String, String> pi = new LinkedHashMap<>();
        DischargeSummary discharge = null;

        for (Entry entry : entries) {
            switch (entry.type()) {
                case "첩약", "환재" -> medications.add(parseMedication(entry));
                case "IMP", "C/C", "F/H", "P/H" -> initial.put(entry.type(), entry.rawContent());
                case "P/I" -> {
                    initial.put(entry.type(), entry.rawContent());
                    pi.putAll(parsePi(entry.rawContent()));
                }
                case "특이사항" -> {
                    if (entry.rawContent().contains("<<DISCHARGE SUMMARY>>")) {
                        discharge = parseDischarge(entry.rawContent());
                    } else {
                        tests.addAll(parseTests(entry));
                        events.add(parseEvent(entry));
                    }
                }
                case "변증기술", "Plan" -> events.add(parseEvent(entry));
                default -> { }
            }
        }

        List<Comparison> comparisons = compareSymptoms(entries);
        List<TestComparison> testComparisons = compareTests(tests);
        entries.sort(Comparator.comparing(Entry::date).thenComparing(Entry::time));
        medications.sort(Comparator.comparing(Medication::date));
        tests.sort(Comparator.comparing(TestResult::date));
        events.sort(Comparator.comparing(ClinicalEvent::date).thenComparing(ClinicalEvent::time));

        EncounterPeriod period = discharge == null ? inferPeriod(entries)
                : new EncounterPeriod(discharge.admitDate(), discharge.dischargeDate(), discharge.days());
        return new Parsed(period, initial, pi, entries, medications, tests, events, discharge,
                comparisons, testComparisons,
                "동일 증상·척도 및 동일 검사·단위의 명시값만 비교하며, 결측값을 추론하지 않습니다.");
    }

    private List<Entry> split(String raw) {
        Matcher matcher = RECORD.matcher(raw);
        List<Header> headers = new ArrayList<>();
        while (matcher.find()) {
            headers.add(new Header(matcher.start(), matcher.end(), matcher.group(1),
                    matcher.group(2), matcher.group(3).trim()));
        }
        List<Entry> entries = new ArrayList<>();
        for (int i = 0; i < headers.size(); i++) {
            Header header = headers.get(i);
            int end = i + 1 < headers.size() ? headers.get(i + 1).start() : raw.length();
            String content = raw.substring(header.contentStart(), end).strip();
            entries.add(parseEntry(header.date(), header.time(), header.type(), content));
        }
        return entries;
    }

    private Entry parseEntry(String date, String time, String type, String content) {
        List<Observation> observations = new ArrayList<>();
        String[] lines = content.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (!line.startsWith("#")) continue;
            Matcher score = SCORE.matcher(line);
            if (!score.find()) continue;
            String scale = score.group(1).replace(".", "").toUpperCase(Locale.ROOT);
            String previous = score.group(3) == null ? null : score.group(2);
            String current = score.group(3) == null ? score.group(2) : score.group(3);
            String symptom = line.substring(1, score.start()).trim();
            String subjective = nextDash(lines, i + 1);
            String objective = nextDash(lines, i + 2);
            observations.add(new Observation(date, time, symptom, scale, previous, current,
                    subjective, objective, line));
        }
        Map<String, String> dailyLiving = new LinkedHashMap<>();
        for (String key : List.of("식사", "소화", "대변", "소변", "수면")) {
            Arrays.stream(lines).map(String::strip).filter(line -> line.startsWith(key + ")"))
                    .findFirst().ifPresent(line -> dailyLiving.put(key, line));
        }
        return new Entry(date, time == null ? "" : time, type, content, observations,
                dailyLiving, parseDailyLiving(dailyLiving));
    }

    private String nextDash(String[] lines, int index) {
        if (index >= lines.length) return "";
        String value = lines[index].stripLeading();
        return value.startsWith("-") ? value.substring(1).trim() : "";
    }

    private Map<String, Map<String, Object>> parseDailyLiving(Map<String, String> raw) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        raw.forEach((key, value) -> {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("raw", value);
            fields.put("source", "EMR");
            if (key.equals("소화")) fields.put("canonicalRaw", value.replace("식후비민감", "식후비만감"));
            if (key.equals("대변")) {
                Matcher last = Pattern.compile("LD-(\\d{4}\\.\\d{2}\\.\\d{2})").matcher(value);
                if (last.find()) fields.put("lastDefecation", LocalDate.parse(last.group(1), DOT_DATE).toString());
            }
            result.put(key, fields);
        });
        return result;
    }

    private Medication parseMedication(Entry entry) {
        Matcher numbers = MED_NUMBER.matcher(entry.rawContent());
        Map<String, String> amounts = new LinkedHashMap<>();
        int firstNumber = entry.rawContent().length();
        while (numbers.find()) {
            amounts.put(numbers.group(1), numbers.group(2));
            firstNumber = Math.min(firstNumber, numbers.start());
        }
        String name = entry.rawContent().substring(0, firstNumber).trim();
        return new Medication(entry.date(), entry.type(), name, amounts, entry.rawContent());
    }

    private Map<String, String> parsePi(String content) {
        Map<String, String> values = new LinkedHashMap<>();
        Matcher matcher = PI_BRACKET.matcher(content);
        while (matcher.find()) values.put(matcher.group(1).trim(), matcher.group(2).trim());
        Matcher followUp = Pattern.compile("(?m)^Next f/u\\)\\s*(.+)$", Pattern.CASE_INSENSITIVE).matcher(content);
        if (followUp.find()) values.put("Next f/u", followUp.group(1).trim());
        return values;
    }

    private DischargeSummary parseDischarge(String content) {
        Matcher days = HOSPITAL_DAYS.matcher(content);
        String admit = null, discharge = null;
        Integer count = null;
        if (days.find()) {
            admit = days.group(1);
            discharge = days.group(2);
            count = Integer.parseInt(days.group(3));
        }
        List<ChiefOutcome> outcomes = new ArrayList<>();
        String cc = section(content, "3) C/C", "4) D/C med");
        Matcher ccMatcher = DISCHARGE_CC.matcher(cc);
        while (ccMatcher.find()) {
            outcomes.add(new ChiefOutcome(Integer.parseInt(ccMatcher.group(1)),
                    ccMatcher.group(2).trim(), ccMatcher.group(3) == null ? null : ccMatcher.group(3).trim()));
        }
        return new DischargeSummary(admit, discharge, count, outcomes,
                section(content, "4) D/C med", "5) Treatment"),
                section(content, "5) Treatment", "<<DISCHARGED>>"), content);
    }

    private String section(String content, String start, String end) {
        int from = content.indexOf(start);
        if (from < 0) return "";
        from += start.length();
        int to = content.indexOf(end, from);
        return content.substring(from, to < 0 ? content.length() : to).trim();
    }

    private List<TestResult> parseTests(Entry entry) {
        List<TestResult> result = new ArrayList<>();
        String panel = null;
        for (String rawLine : entry.rawContent().split("\\R")) {
            String line = rawLine.strip();
            if (line.startsWith("**")) {
                panel = line.substring(2).replaceFirst("\\([^)]*\\)$", "").trim();
                continue;
            }
            if (panel == null || line.isBlank()) continue;
            Matcher matcher = TEST_LINE.matcher(line);
            if (matcher.find()) {
                result.add(new TestResult(entry.date(), panel, matcher.group(1).trim(), matcher.group(2),
                        matcher.group(3), matcher.group(4), line));
            }
        }
        return result;
    }

    private ClinicalEvent parseEvent(Entry entry) {
        Matcher vital = VITAL.matcher(entry.rawContent());
        Map<String, String> values = new LinkedHashMap<>();
        String eventType = entry.type();
        if (vital.find()) {
            eventType = "VITAL";
            values.put("SBP", vital.group(1)); values.put("DBP", vital.group(2));
            values.put("HR", vital.group(3)); values.put("RR", vital.group(4)); values.put("BT", vital.group(5));
        }
        return new ClinicalEvent(entry.date(), entry.time(), eventType, values, entry.rawContent());
    }

    private List<Comparison> compareSymptoms(List<Entry> entries) {
        Map<String, List<Observation>> groups = new LinkedHashMap<>();
        for (Entry entry : entries) for (Observation observation : entry.observations()) {
            groups.computeIfAbsent(observation.symptom() + "|" + observation.scale(), key -> new ArrayList<>())
                    .add(observation);
        }
        List<Comparison> result = new ArrayList<>();
        for (List<Observation> group : groups.values()) {
            group.sort(Comparator.comparing(Observation::date).thenComparing(Observation::time));
            if (group.size() < 2) continue;
            Observation first = group.get(0), last = group.get(group.size() - 1);
            result.add(new Comparison(last.symptom(), last.scale(), first.current(), last.current(),
                    numericDelta(first.current(), last.current()), first.date(), last.date()));
        }
        return result;
    }

    private List<TestComparison> compareTests(List<TestResult> tests) {
        Map<String, List<TestResult>> groups = new LinkedHashMap<>();
        for (TestResult test : tests) {
            groups.computeIfAbsent(test.panel() + "|" + test.metric() + "|" + Objects.toString(test.unit(), ""),
                    key -> new ArrayList<>()).add(test);
        }
        List<TestComparison> result = new ArrayList<>();
        for (List<TestResult> group : groups.values()) {
            group.sort(Comparator.comparing(TestResult::date));
            if (group.size() < 2) continue;
            TestResult first = group.get(0), last = group.get(group.size() - 1);
            result.add(new TestComparison(last.panel(), last.metric(), last.unit(), first.value(), last.value(),
                    numericDelta(first.value(), last.value()), first.date(), last.date()));
        }
        return result;
    }

    private EncounterPeriod inferPeriod(List<Entry> entries) {
        List<String> dates = entries.stream().map(Entry::date).sorted().toList();
        String first = dates.get(0), last = dates.get(dates.size() - 1);
        long days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(first), LocalDate.parse(last)) + 1;
        return new EncounterPeriod(first, last, (int) days);
    }

    private Double numericDelta(String first, String last) {
        try { return Double.parseDouble(last) - Double.parseDouble(first); }
        catch (Exception ignored) { return null; }
    }

    private record Header(int start, int contentStart, String date, String time, String type) { }

    public record Parsed(EncounterPeriod encounter, Map<String, String> initial,
                         Map<String, String> parkinsonsHistory, List<Entry> entries,
                         List<Medication> medications, List<TestResult> tests,
                         List<ClinicalEvent> events, DischargeSummary discharge,
                         List<Comparison> comparisons, List<TestComparison> testComparisons,
                         String rule) { }
    public record EncounterPeriod(String admitDate, String dischargeDate, Integer days) { }
    public record Entry(String date, String time, String type, String rawContent,
                        List<Observation> observations, Map<String, String> dailyLiving,
                        Map<String, Map<String, Object>> generalReview) { }
    public record Observation(String date, String time, String symptom, String scale,
                              String previous, String current, String subjective,
                              String objective, String source) { }
    public record Medication(String date, String type, String name, Map<String, String> amounts,
                             String raw) { }
    public record TestResult(String date, String panel, String metric, String value, String unit,
                             String flag, String raw) { }
    public record ClinicalEvent(String date, String time, String type, Map<String, String> values,
                                String raw) { }
    public record DischargeSummary(String admitDate, String dischargeDate, Integer days,
                                   List<ChiefOutcome> chiefComplaints, String dischargeMedication,
                                   String treatment, String raw) { }
    public record ChiefOutcome(int rank, String name, String outcome) { }
    public record Comparison(String symptom, String scale, String first, String last, Double delta,
                             String firstDate, String lastDate) { }
    public record TestComparison(String panel, String metric, String unit, String first, String last,
                                 Double delta, String firstDate, String lastDate) { }
}
