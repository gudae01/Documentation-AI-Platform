package com.mediflow.backend.pd.stt;

import java.util.List;

public record SttResponse(String text, String language, double languageProbability,
                          double duration, String model, String diarizationModel,
                          int speakerCount, List<Segment> segments) {
    public record Segment(int id, double start, double end, String text,
                          double confidence, String speaker, String speakerRole) { }
}
