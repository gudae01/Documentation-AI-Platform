package com.mediflow.backend.pd;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.net.URI;
import java.util.Map;

@Service
public class QuestionnaireDeliveryService {
    private final String webhookUrl; private final String webhookToken; private final RestClient client=RestClient.create();
    public QuestionnaireDeliveryService(@Value("${app.questionnaire.delivery.webhook-url:}") String url,@Value("${app.questionnaire.delivery.webhook-token:}") String token){webhookUrl=url;webhookToken=token;}
    public Result send(String channel,String recipient,String link){
        if(webhookUrl==null||webhookUrl.isBlank()) return new Result(QuestionnaireInvitation.DeliveryStatus.NOT_CONFIGURED,"전송 웹훅이 설정되지 않아 링크만 생성했습니다.");
        URI uri=URI.create(webhookUrl); if(!"https".equalsIgnoreCase(uri.getScheme())&&!"localhost".equalsIgnoreCase(uri.getHost())) throw new IllegalStateException("문진 전송 웹훅은 HTTPS만 허용됩니다.");
        try{ var request=client.post().uri(uri).contentType(MediaType.APPLICATION_JSON); if(webhookToken!=null&&!webhookToken.isBlank()) request=request.header("Authorization","Bearer "+webhookToken);
            request.body(Map.of("channel",channel,"recipient",recipient,"message","파킨슨병 사전 문진을 작성해 주세요.","link",link)).retrieve().toBodilessEntity();
            return new Result(QuestionnaireInvitation.DeliveryStatus.SENT,"전송 완료");
        }catch(Exception e){return new Result(QuestionnaireInvitation.DeliveryStatus.FAILED,"전송 실패");}
    }
    public record Result(QuestionnaireInvitation.DeliveryStatus status,String message){}
}
