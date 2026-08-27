package com.mediflow.backend.pd;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface PdPatientRepository extends JpaRepository<PdPatient, UUID> {
    Optional<PdPatient> findFirstByNameIndexAndBirth6IndexAndSex(String nameIndex, String birth6Index, String sex);
    List<PdPatient> findTop100ByOrderByCreatedAtDesc();
}
