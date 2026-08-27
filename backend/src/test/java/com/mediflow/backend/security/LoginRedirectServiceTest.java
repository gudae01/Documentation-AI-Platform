package com.mediflow.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class LoginRedirectServiceTest {
    private final LoginRedirectService redirects = new LoginRedirectService(
            "http://localhost:5173/Documentation-AI-Platform/",
            "http://localhost:5173,http://192.168.30.33:5173");

    @Test
    void returnsOnlyAnAllowedFrontendUrlAfterLogin() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        redirects.remember(request, "http://192.168.30.33:5173/Documentation-AI-Platform/");

        assertThat(redirects.consume(request))
                .isEqualTo("http://192.168.30.33:5173/Documentation-AI-Platform/");
    }

    @Test
    void rejectsExternalAndUserInfoBasedRedirects() {
        MockHttpServletRequest external = new MockHttpServletRequest();
        redirects.remember(external, "https://attacker.example/steal");
        assertThat(redirects.consume(external))
                .isEqualTo("http://localhost:5173/Documentation-AI-Platform/");

        MockHttpServletRequest misleading = new MockHttpServletRequest();
        redirects.remember(misleading, "http://192.168.30.33:5173@attacker.example/steal");
        assertThat(redirects.consume(misleading))
                .isEqualTo("http://localhost:5173/Documentation-AI-Platform/");
    }

    @Test
    void consumesTheStoredTargetOnlyOnce() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        redirects.remember(request, "http://localhost:5173/Documentation-AI-Platform/?view=patients");

        assertThat(redirects.consume(request))
                .isEqualTo("http://localhost:5173/Documentation-AI-Platform/?view=patients");
        assertThat(redirects.consume(request))
                .isEqualTo("http://localhost:5173/Documentation-AI-Platform/");
    }
}
