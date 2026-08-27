package com.mediflow.backend.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final LoginRedirectService loginRedirectService;

    public AuthController(LoginRedirectService loginRedirectService) {
        this.loginRedirectService = loginRedirectService;
    }

    @GetMapping("/login")
    public ResponseEntity<Void> login(@RequestParam String returnUrl, HttpServletRequest request) {
        loginRedirectService.remember(request, returnUrl);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header("Location", "/oauth2/authorization/kakao")
                .build();
    }

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
