package com.mediflow.backend.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @GetMapping("/me")
    public AuthResponse me(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof KakaoPrincipal principal)) {
            return new AuthResponse(false, null);
        }
        return new AuthResponse(true, principal.getNickname());
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getParameterName(), token.getToken());
    }

    public record AuthResponse(boolean authenticated, String nickname) {
    }

    public record CsrfResponse(String headerName, String parameterName, String token) {
    }
}
