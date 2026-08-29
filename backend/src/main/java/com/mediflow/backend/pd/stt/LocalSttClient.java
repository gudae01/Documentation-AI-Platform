package com.mediflow.backend.pd.stt;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

@Component
public class LocalSttClient {
    private final RestClient client;

    public LocalSttClient(@Value("${app.stt.base-url}") String baseUrl,
                          @Value("${app.stt.connect-timeout-seconds:5}") long connectTimeoutSeconds,
                          @Value("${app.stt.read-timeout-seconds:900}") long readTimeoutSeconds) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(Math.max(1, connectTimeoutSeconds)));
        requestFactory.setReadTimeout(Duration.ofSeconds(Math.max(1, readTimeoutSeconds)));
        this.client = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public SttResponse transcribe(MultipartFile file) {
        try {
            Resource resource = file.getResource();
            MediaType contentType = safeMediaType(file.getContentType());
            HttpHeaders partHeaders = new HttpHeaders();
            partHeaders.setContentType(contentType);
            partHeaders.setContentDisposition(ContentDisposition.formData()
                    .name("file")
                    .filename(safeFilename(file.getOriginalFilename()))
                    .build());
            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("file", new HttpEntity<>(resource, partHeaders));
            SttResponse response = client.post()
                    .uri("/v1/transcriptions")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(body)
                    .retrieve()
                    .body(SttResponse.class);
            if (response == null) {
                throw new SttUnavailableException("자체 STT가 빈 응답을 반환했습니다.", null);
            }
            return response;
        } catch (RestClientException exception) {
            throw new SttUnavailableException(
                    "자체 STT에 연결하지 못했습니다. STT 컨테이너 상태를 확인해 주세요.", exception);
        }
    }

    private MediaType safeMediaType(String value) {
        if (value == null || value.isBlank()) return MediaType.APPLICATION_OCTET_STREAM;
        try {
            return MediaType.parseMediaType(value);
        } catch (IllegalArgumentException exception) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private String safeFilename(String value) {
        return value == null || value.isBlank() ? "audio" : value;
    }
}
