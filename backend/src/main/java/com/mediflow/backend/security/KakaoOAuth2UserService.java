package com.mediflow.backend.security;

import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class KakaoOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    private final DefaultOAuth2UserService delegate = new DefaultOAuth2UserService();
    private final Set<String> allowedKakaoIds;

    public KakaoOAuth2UserService(@Value("${app.clinician-kakao-ids:}") String allowedKakaoIds) {
        this.allowedKakaoIds = Arrays.stream(allowedKakaoIds.split(","))
                .map(String::trim).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) throws OAuth2AuthenticationException {
        OAuth2User user = delegate.loadUser(request);
        Object rawId = user.getAttributes().get("id");
        if (rawId == null) {
            throw new OAuth2AuthenticationException("카카오 회원번호를 확인할 수 없습니다.");
        }
        String kakaoId = String.valueOf(rawId);
        if (!allowedKakaoIds.contains(kakaoId)) {
            throw new OAuth2AuthenticationException("등록되지 않은 의료진 계정입니다.");
        }

        return new KakaoPrincipal(kakaoId, "의료진", user.getAttributes());
    }
}
