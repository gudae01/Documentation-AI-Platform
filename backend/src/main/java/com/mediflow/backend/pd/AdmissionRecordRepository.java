package com.mediflow.backend.pd;import org.springframework.data.jpa.repository.JpaRepository;import java.util.*;
public interface AdmissionRecordRepository extends JpaRepository<AdmissionRecord,UUID>{List<AdmissionRecord> findTop100ByOrderByCreatedAtDesc();}
