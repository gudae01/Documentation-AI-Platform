package com.mediflow.backend.pd.stt;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Locale;
import java.util.Set;

@Service
public class SttService {
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            "aac", "flac", "m4a", "mp3", "mp4", "ogg", "wav", "webm");

    private final LocalSttClient client;
    private final long maxAudioBytes;

    public SttService(LocalSttClient client,
                      @Value("${app.stt.max-audio-size-mb:100}") long maxAudioSizeMb) {
        this.client = client;
        this.maxAudioBytes = Math.max(1, maxAudioSizeMb) * 1024 * 1024;
    }

    public SttResponse transcribe(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("녹음파일을 선택해 주세요.");
        }
        if (file.getSize() > maxAudioBytes) {
            throw new IllegalArgumentException("녹음파일은 " + (maxAudioBytes / 1024 / 1024) + "MB 이하만 변환할 수 있습니다.");
        }
        String fileName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        int extensionIndex = fileName.lastIndexOf('.');
        String extension = extensionIndex < 0 ? "" : fileName.substring(extensionIndex + 1).toLowerCase(Locale.ROOT);
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase(Locale.ROOT);
        boolean audioContent = contentType.startsWith("audio/") || contentType.startsWith("video/mp4")
                || contentType.equals("application/octet-stream");
        if (!ALLOWED_EXTENSIONS.contains(extension) || !audioContent) {
            throw new IllegalArgumentException("M4A, MP3, WAV, AAC, OGG, FLAC, MP4, WEBM 음성파일만 변환할 수 있습니다.");
        }
        return client.transcribe(file);
    }
}
