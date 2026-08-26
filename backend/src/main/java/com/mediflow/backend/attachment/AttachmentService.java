package com.mediflow.backend.attachment;

import com.mediflow.backend.common.ConflictException;
import com.mediflow.backend.common.NotFoundException;
import com.mediflow.backend.encounter.Encounter;
import com.mediflow.backend.encounter.EncounterService;
import com.mediflow.backend.encounter.EncounterStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class AttachmentService {

    private static final long MAX_FILE_SIZE = 100L * 1024 * 1024;

    private final EncounterAttachmentRepository attachmentRepository;
    private final EncounterService encounterService;

    public AttachmentService(EncounterAttachmentRepository attachmentRepository, EncounterService encounterService) {
        this.attachmentRepository = attachmentRepository;
        this.encounterService = encounterService;
    }

    public AttachmentResponse upload(String ownerKey, UUID encounterId, AttachmentType type, MultipartFile file) {
        Encounter encounter = encounterService.requireOwned(encounterId, ownerKey);
        if (encounter.getStatus() != EncounterStatus.DRAFT) {
            throw new ConflictException("승인된 진료에는 파일을 추가할 수 없습니다.");
        }
        if (file.isEmpty()) {
            throw new IllegalArgumentException("빈 파일은 업로드할 수 없습니다.");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("파일은 100MB 이하만 업로드할 수 있습니다.");
        }

        try {
            String fileName = sanitize(file.getOriginalFilename());
            String contentType = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
            EncounterAttachment attachment = new EncounterAttachment(
                    encounter, type, fileName, contentType, file.getBytes());
            return AttachmentResponse.from(attachmentRepository.save(attachment));
        } catch (IOException exception) {
            throw new IllegalStateException("파일을 저장하지 못했습니다.", exception);
        }
    }

    @Transactional(readOnly = true)
    public List<AttachmentResponse> list(String ownerKey, UUID encounterId) {
        encounterService.requireOwned(encounterId, ownerKey);
        return attachmentRepository.findByEncounterIdOrderByCreatedAtAsc(encounterId)
                .stream().map(AttachmentResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public EncounterAttachment download(String ownerKey, UUID attachmentId) {
        return attachmentRepository.findByIdAndEncounterOwnerKey(attachmentId, ownerKey)
                .orElseThrow(() -> new NotFoundException("첨부파일을 찾을 수 없습니다."));
    }

    private String sanitize(String originalFileName) {
        if (originalFileName == null || originalFileName.isBlank()) {
            return "attachment";
        }
        String normalized = originalFileName.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1).trim();
        return name.isEmpty() ? "attachment" : name.substring(0, Math.min(name.length(), 255));
    }
}
