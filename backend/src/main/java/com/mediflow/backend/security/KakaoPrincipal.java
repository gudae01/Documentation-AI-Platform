package com.mediflow.backend.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class KakaoPrincipal implements OAuth2User, Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private final String kakaoId;
    private final String nickname;
    private final Map<String, Object> attributes;

    public KakaoPrincipal(String kakaoId, String nickname, Map<String, Object> attributes) {
        this.kakaoId = kakaoId;
        this.nickname = nickname;
        this.attributes = Map.copyOf(attributes);
    }

    @Override
    public Map<String, Object> getAttributes() {
        return attributes;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of();
    }

    @Override
    public String getName() {
        return kakaoId;
    }

    public String getNickname() {
        return nickname;
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof KakaoPrincipal that && kakaoId.equals(that.kakaoId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(kakaoId);
    }
}
