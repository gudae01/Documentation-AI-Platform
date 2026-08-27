package com.mediflow.backend.pd;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class QuestionnaireChangePublisher {
    private static final long CONNECTION_TIMEOUT_MILLIS = 30L * 60L * 1000L;
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(CONNECTION_TIMEOUT_MILLIS);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("ready").data(new ChangeEvent(null, Instant.now())));
        } catch (IOException exception) {
            emitters.remove(emitter);
            emitter.completeWithError(exception);
        }
        return emitter;
    }

    public void publish(UUID questionnaireId) {
        ChangeEvent event = new ChangeEvent(questionnaireId, Instant.now());
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("questionnaire-changed").data(event));
            } catch (IOException | IllegalStateException exception) {
                emitters.remove(emitter);
                emitter.complete();
            }
        }
    }

    public record ChangeEvent(UUID questionnaireId, Instant changedAt) { }
}
