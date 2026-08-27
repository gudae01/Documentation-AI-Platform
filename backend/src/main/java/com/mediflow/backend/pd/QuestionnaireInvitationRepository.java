package com.mediflow.backend.pd;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface QuestionnaireInvitationRepository extends JpaRepository<QuestionnaireInvitation,UUID>{
    Optional<QuestionnaireInvitation> findByTokenHash(String tokenHash);
    List<QuestionnaireInvitation> findTop100ByOrderByCreatedAtDesc();
}
