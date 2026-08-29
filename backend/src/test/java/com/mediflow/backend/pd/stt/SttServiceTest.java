package com.mediflow.backend.pd.stt;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SttServiceTest {
    private final LocalSttClient client = mock(LocalSttClient.class);
    private final SttService service = new SttService(client, 1);

    @Test
    void acceptsBrowserWebmRecordingAndKeepsSpeakerUnconfirmed() {
        var audio = new MockMultipartFile(
                "file", "recording.webm", "audio/webm;codecs=opus", new byte[]{1, 2, 3});
        var expected = new SttResponse(
                "오른손 떨림이 있습니다.", "ko", 0.99, 2.1, "small",
                "sherpa-onnx-pyannote-3.0+3dspeaker-eres2net", 1,
                List.of(new SttResponse.Segment(
                        0, 0, 2.1, "오른손 떨림이 있습니다.", 0.92, "화자 A", "확인 필요")));
        when(client.transcribe(audio)).thenReturn(expected);

        assertThat(service.transcribe(audio)).isEqualTo(expected);
        verify(client).transcribe(audio);
    }

    @Test
    void rejectsNonAudioUpload() {
        var file = new MockMultipartFile("file", "notes.txt", "text/plain", "memo".getBytes());
        assertThatThrownBy(() -> service.transcribe(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("음성파일만");
    }

    @Test
    void rejectsAudioLargerThanConfiguredLimitBeforeCallingStt() {
        var audio = new MockMultipartFile(
                "file", "recording.wav", "audio/wav", new byte[1024 * 1024 + 1]);

        assertThatThrownBy(() -> service.transcribe(audio))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("1MB 이하");
        verifyNoInteractions(client);
    }
}
