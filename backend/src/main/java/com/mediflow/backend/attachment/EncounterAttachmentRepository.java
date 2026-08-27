package com.mediflow.backend.attachment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface EncounterAttachmentRepository extends JpaRepository<EncounterAttachment, UUID> {
    List<EncounterAttachment> findByEncounterIdOrderByCreatedAtAsc(UUID encounterId);
    List<EncounterAttachment> findByEncounterIdInOrderByCreatedAtAsc(Collection<UUID> encounterIds);
    Optional<EncounterAttachment> findByIdAndEncounterOwnerKey(UUID id, String ownerKey);
}
