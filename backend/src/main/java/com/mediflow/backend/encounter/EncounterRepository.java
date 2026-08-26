package com.mediflow.backend.encounter;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EncounterRepository extends JpaRepository<Encounter, UUID> {

    @EntityGraph(attributePaths = "patient")
    Optional<Encounter> findByIdAndOwnerKey(UUID id, String ownerKey);

    @EntityGraph(attributePaths = "patient")
    Optional<Encounter> findFirstByOwnerKeyAndStatusOrderByUpdatedAtDesc(
            String ownerKey, EncounterStatus status);
}
