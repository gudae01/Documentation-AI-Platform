package com.mediflow.backend.pd;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface QuestionnaireSubmissionRepository extends JpaRepository<QuestionnaireSubmission,UUID>{List<QuestionnaireSubmission> findTop100ByOrderByCreatedAtDesc();}
