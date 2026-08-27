package com.mediflow.backend.pd;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface AdmissionAttachmentRepository extends JpaRepository<AdmissionAttachment, UUID> {
    List<AdmissionAttachment> findByAdmissionIdOrderByCreatedAtAsc(UUID admissionId);
    Optional<AdmissionAttachment> findByIdAndAdmissionId(UUID id, UUID admissionId);
}
