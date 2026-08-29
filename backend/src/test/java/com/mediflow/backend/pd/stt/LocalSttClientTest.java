package com.mediflow.backend.pd.stt;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class LocalSttClientTest {
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void sendsAudioAsMultipartAndReadsDiarizedTranscript() throws Exception {
        AtomicReference<String> contentType = new AtomicReference<>();
        AtomicReference<byte[]> requestBody = new AtomicReference<>();
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/transcriptions", exchange -> {
            contentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(exchange.getRequestBody().readAllBytes());
            byte[] response = ("{\"text\":\"오른손 떨림\",\"language\":\"ko\","
                    + "\"languageProbability\":0.98,\"duration\":2.0,\"model\":\"small\","
                    + "\"diarizationModel\":\"local\",\"speakerCount\":1,\"segments\":[{"
                    + "\"id\":0,\"start\":0.0,\"end\":2.0,\"text\":\"오른손 떨림\","
                    + "\"confidence\":0.9,\"speaker\":\"화자 A\",\"speakerRole\":\"확인 필요\"}]}"
            ).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        LocalSttClient client = new LocalSttClient(
                "http://127.0.0.1:" + server.getAddress().getPort(), 2, 10);
        MockMultipartFile audio = new MockMultipartFile(
                "file", "clinic.wav", "audio/wav", new byte[]{1, 2, 3, 4});

        SttResponse response = client.transcribe(audio);

        assertThat(response.text()).isEqualTo("오른손 떨림");
        assertThat(response.segments()).singleElement().satisfies(segment ->
                assertThat(segment.speaker()).isEqualTo("화자 A"));
        assertThat(contentType.get()).startsWith("multipart/form-data;boundary=");
        assertThat(new String(requestBody.get(), StandardCharsets.ISO_8859_1))
                .contains("name=\"file\"")
                .contains("filename=\"clinic.wav\"")
                .contains("Content-Type: audio/wav");
    }
}
