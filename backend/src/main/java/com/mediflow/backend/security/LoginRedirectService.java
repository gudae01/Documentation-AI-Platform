package com.mediflow.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class LoginRedirectService {
    private static final String SESSION_ATTRIBUTE = LoginRedirectService.class.getName() + ".RETURN_URL";

    private final String fallbackUrl;
    private final Set<String> allowedOrigins;

    public LoginRedirectService(@Value("${app.frontend-url}") String fallbackUrl,
                                @Value("${app.cors-allowed-origins}") String allowedOrigins) {
        this.fallbackUrl = fallbackUrl;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public void remember(HttpServletRequest request, String requestedUrl) {
        request.getSession(true).setAttribute(SESSION_ATTRIBUTE, validate(requestedUrl));
    }

    public String consume(HttpServletRequest request) {
        Object value = request.getSession(false) == null
                ? null
                : request.getSession(false).getAttribute(SESSION_ATTRIBUTE);
        if (request.getSession(false) != null) request.getSession(false).removeAttribute(SESSION_ATTRIBUTE);
        return value instanceof String url ? validate(url) : fallbackUrl;
    }

    private String validate(String candidate) {
        try {
            URI uri = URI.create(candidate);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getRawUserInfo() != null) {
                return fallbackUrl;
            }
            String origin = uri.getScheme().toLowerCase() + "://" + uri.getAuthority();
            return allowedOrigins.contains(origin) ? uri.toString() : fallbackUrl;
        } catch (IllegalArgumentException exception) {
            return fallbackUrl;
        }
    }
}
