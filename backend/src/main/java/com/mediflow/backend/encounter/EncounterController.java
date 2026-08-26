package com.mediflow.backend.encounter;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api")
public class EncounterController {

    private final EncounterService encounterService;

    public EncounterController(EncounterService encounterService) {
        this.encounterService = encounterService;
    }

    @PostMapping("/encounters")
    public ResponseEntity<EncounterResponse> create(Authentication authentication,
                                                    @Valid @RequestBody CreateEncounterRequest request) {
        return ResponseEntity.status(201).body(encounterService.create(authentication.getName(), request));
    }

    @GetMapping("/encounters/{encounterId}")
    public EncounterResponse get(Authentication authentication, @PathVariable UUID encounterId) {
        return encounterService.get(authentication.getName(), encounterId);
    }

    @PutMapping("/encounters/{encounterId}/draft")
    public EncounterResponse saveDraft(Authentication authentication, @PathVariable UUID encounterId,
                                       @Valid @RequestBody SaveDraftRequest request) {
        return encounterService.saveDraft(authentication.getName(), encounterId, request);
    }

    @GetMapping("/drafts/latest")
    public ResponseEntity<EncounterResponse> latestDraft(Authentication authentication) {
        return encounterService.latestDraft(authentication.getName())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/encounters/{encounterId}/approve")
    public EncounterResponse approve(Authentication authentication, @PathVariable UUID encounterId,
                                     @Valid @RequestBody ApproveEncounterRequest request) {
        return encounterService.approve(authentication.getName(), encounterId, request);
    }
}
