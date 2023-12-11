---
title: "RabbitMQ 메시지는 어느 구간에서 유실되는가"
description: "발행, 소비, 브로커 세 구간에서 메시지가 유실되는 조건을 정리하고, 각 구간을 어떤 설정과 코드로 막을 수 있는지, 그 대가로 무엇을 내주는지 정리한다."
date: "2023-12-11"
category: "Backend"
tags:
  - RabbitMQ
  - Spring
  - Message Queue
draft: true
popularRank: 0
---

RabbitMQ는 기본 설정만으로도 잘 동작하지만, 그 기본값은 성능 쪽으로 기울어 있다. 정합성이 중요한 메시지를 다룬다면 "어디서 유실될 수 있는가"를 구간별로 나눠 보고, 각 구간을 막는 대가가 무엇인지까지 함께 알아야 한다.

메시지가 사라질 수 있는 구간은 크게 세 곳이다.

```text
Publisher  ──①──▶  Broker(Exchange → Queue)  ──②──▶  Consumer
                          │
                          ③ 브로커 자체 장애
```

1. 발행: 애플리케이션이 보냈다고 믿었지만 브로커에 닿지 않은 경우
2. 소비: 브로커는 전달했다고 믿었지만 컨슈머가 처리하지 못한 경우
3. 브로커: 브로커가 받긴 했지만 자체 장애가 발생한 경우

---

## 전제: RabbitMQ가 줄 수 있는 건 at-least-once다

구체적인 설정에 들어가기 전에 짚어야 할 게 있다. 아래에서 다룰 설정들을 전부 적용해도 **exactly-once(정확히 한 번)는 얻을 수 없다.** 얻을 수 있는 건 at-least-once(최소 한 번)다.

이유는 확인 신호 자체가 유실될 수 있기 때문이다. 컨슈머가 메시지를 정상적으로 처리하고 ACK를 보내는 순간 연결이 끊기면, 브로커는 ACK를 받지 못했으므로 그 메시지를 다시 전달한다. 컨슈머 입장에서는 이미 처리한 메시지를 한 번 더 받는 것이다. 발행 쪽도 마찬가지다. 브로커가 메시지를 받고 confirm을 보내는 도중 연결이 끊기면, 발행자는 실패로 판단해 재전송하고 브로커에는 같은 메시지가 두 개 쌓인다.

그래서 유실 방지 설정은 **"중복은 감수하고 유실을 없애는" 방향**으로 동작한다. 중복을 감당하는 건 컨슈머의 몫이고, 이 글의 2번 구간에서 다룬다.

---

## 1. 발행 구간에서 실패하는 경우

발행이 실패하는 경로는 세 가지다.

- 네트워크 문제로 브로커까지 도달하지 못함
- 브로커가 다운되어 받을 수 없음
- 브로커에는 도착했지만 라우팅 키에 맞는 큐가 없어 Exchange에서 버려짐

세 번째가 특히 조용하다. 메시지는 정상적으로 전송됐고 예외도 나지 않는데, 갈 곳이 없어 그냥 사라진다. 바인딩 설정이 바뀌거나 오타가 난 라우팅 키를 쓰면 이 경로로 빠진다.

### 설정

```yaml
spring:
  rabbitmq:
    publisher-confirm-type: correlated
    publisher-returns: true
```

`publisher-confirm-type`은 브로커가 메시지를 받았는지 확인하는 방식을 정한다.

| 값 | 동작 |
| --- | --- |
| `none` (기본) | 확인하지 않음 |
| `simple` | 발행 후 `waitForConfirms()`로 **블로킹하며** 확인 |
| `correlated` | `CorrelationData`를 붙여 **비동기 콜백**으로 확인 |

`simple`은 발행 스레드가 확인을 기다리며 멈추기 때문에 처리량이 크게 떨어진다. 대신 코드는 단순하다. `correlated`는 발행과 확인이 분리되어 처리량을 유지하면서도 메시지 단위로 결과를 알 수 있다. 비동기라 결과를 받을 콜백을 따로 구현해야 한다.

`publisher-returns: true`는 Exchange까지는 갔지만 큐로 라우팅되지 못한 메시지를 돌려받게 한다. 위에서 말한 세 번째 경로를 잡는 설정이다.

### 코드

```java
@Configuration
public class RabbitMQConfig {

    private static final Logger log = LoggerFactory.getLogger(RabbitMQConfig.class);

    @Bean
    public RetryTemplate retryTemplate() {
        final RetryTemplate retryTemplate = new RetryTemplate();
        retryTemplate.setRetryPolicy(new SimpleRetryPolicy(3, Map.of(Exception.class, true)));

        // 고정 간격보다는 지수 백오프가 안전하다.
        // 브로커가 일시적으로 과부하일 때 고정 간격 재시도는 부하를 그대로 유지시킨다.
        final ExponentialBackOffPolicy backOff = new ExponentialBackOffPolicy();
        backOff.setInitialInterval(1000);
        backOff.setMultiplier(2.0);
        backOff.setMaxInterval(10000);
        retryTemplate.setBackOffPolicy(backOff);

        return retryTemplate;
    }

    @Bean
    public RabbitTemplate rabbitTemplate(
        final ConnectionFactory connectionFactory,
        final RetryTemplate retryTemplate
    ) {
        final RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setRetryTemplate(retryTemplate);

        // 라우팅되지 못한 메시지를 버리지 않고 반환받는다. publisher-returns와 함께 필요하다.
        rabbitTemplate.setMandatory(true);

        rabbitTemplate.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                return;
            }
            log.error("NACK. id={}, cause={}",
                correlationData != null ? correlationData.getId() : "unknown", cause);
            saveFailedMessage(correlationData, cause);
        });

        rabbitTemplate.setReturnsCallback(returned ->
            log.warn("라우팅 실패. exchange={}, routingKey={}, replyText={}",
                returned.getExchange(), returned.getRoutingKey(), returned.getReplyText()));

        return rabbitTemplate;
    }
}
```

### RetryTemplate과 ConfirmCallback은 서로 다른 실패를 잡는다

둘 다 발행 실패를 다루지만 담당 구간이 다르다. 이걸 구분하지 않으면 한쪽만 설정해두고 막았다고 착각하기 쉽다.

- **RetryTemplate**은 `send()` 호출이 **예외를 던질 때** 동작한다. 연결이 끊겨 있거나 타임아웃이 난 경우다.
- **Publisher Confirm은 비동기다.** 브로커가 NACK을 보내도 `send()`는 이미 정상 반환한 뒤다. 예외가 아니므로 RetryTemplate이 개입할 수 없고, `ConfirmCallback`에서 직접 처리해야 한다.

`correlated` 모드에서 콜백이 의미를 가지려면 발행할 때 `CorrelationData`를 넘겨야 한다. 이게 없으면 콜백의 `correlationData`가 null로 들어와서 "뭔가 실패했다"는 것만 알 뿐, 어떤 메시지가 실패했는지 알 수 없어 재전송할 수가 없다.

```java
rabbitTemplate.convertAndSend(exchange, routingKey, payload,
    new CorrelationData(messageId));
```

### 남는 구멍: 저장과 발행은 원자적이지 않다

`ConfirmCallback`에서 실패 메시지를 RDB에 적재하는 방식에도 한계가 있다. 비즈니스 트랜잭션이 커밋된 뒤 애플리케이션이 죽으면, 발행도 안 됐고 실패 기록도 남지 않는다. 확인 신호를 받을 주체 자체가 사라졌기 때문이다.

여기까지 보장하려면 발행 자체를 비즈니스 트랜잭션에 묶는 **Transactional Outbox** 패턴이 필요하다. 보낼 메시지를 같은 트랜잭션 안에서 outbox 테이블에 INSERT하고, 별도 프로세스가 그 테이블을 읽어 발행한 뒤 발행 완료로 표시하는 방식이다. 트랜잭션이 커밋됐다면 메시지는 반드시 테이블에 있으므로, 언제 죽더라도 결국 발행된다.

콜백 기반 적재는 그보다 가벼운 대신 "애플리케이션이 살아 있는 동안의 실패"만 잡는다. 어느 쪽이 필요한지는 그 메시지가 유실됐을 때 무엇이 깨지는지에 달려 있다.

---

## 2. 소비 구간: 전달했지만 처리되지 않은 경우

기본 설정(`AUTO` ack)에서 Spring AMQP는 리스너 메서드가 예외 없이 끝나면 ACK를 보낸다. 문제는 처리 도중 프로세스가 죽는 경우다. 메시지는 이미 브로커에서 빠져나왔는데 처리는 끝나지 않았으니 그대로 사라진다.

### 수동 ACK: 처리 완료 시점을 직접 정한다

```java
@RabbitListener(queues = "example.queue", ackMode = "MANUAL")
public void consume(final Message message, final Channel channel) throws IOException {
    final long deliveryTag = message.getMessageProperties().getDeliveryTag();
    try {
        processMessage(new String(message.getBody()));
        channel.basicAck(deliveryTag, false);
    } catch (Exception e) {
        log.error("처리 실패. deliveryTag={}", deliveryTag, e);
        // requeue=false: 같은 메시지를 즉시 다시 받지 않고 DLQ로 보낸다
        channel.basicNack(deliveryTag, false, false);
    }
}
```

핵심은 **ACK를 처리가 끝난 뒤에 보낸다**는 것이다. 그 전에 컨슈머가 죽으면 브로커는 ACK를 받지 못했으므로 메시지를 다른 컨슈머에게 다시 전달한다. 유실 대신 중복이 생기는 구조로 바뀌는 것이다.

### requeue=true는 포이즌 메시지를 만든다

실패 시 `basicNack(tag, false, true)`로 큐에 되돌리는 코드를 흔히 보는데, 이건 일시적 오류에만 맞다. 메시지 자체가 잘못되어 있어 몇 번을 처리해도 실패하는 경우라면, 재삽입 → 재수신 → 실패 → 재삽입이 끝없이 반복된다. CPU를 태우면서 뒤에 있는 정상 메시지까지 밀리게 하는 상태가 된다.

그래서 실패 메시지는 큐로 되돌리지 않고 격리하는 편이 안전하다.

### Dead Letter Queue로 격리하기

```java
@Configuration
public class RabbitMQConfig {

    @Bean
    public Queue mainQueue() {
        return QueueBuilder.durable("queue1")
                .withArgument("x-dead-letter-exchange", "dlx.exchange")
                .withArgument("x-dead-letter-routing-key", "dlx.queue")
                .build();
    }

    @Bean
    public Queue deadLetterQueue() {
        return QueueBuilder.durable("dlx.queue").build();
    }

    @Bean
    public DirectExchange deadLetterExchange() {
        return new DirectExchange("dlx.exchange");
    }

    @Bean
    public Binding dlqBinding() {
        return BindingBuilder.bind(deadLetterQueue()).to(deadLetterExchange()).with("dlx.queue");
    }
}
```

`requeue=false`로 거부된 메시지는 원래 큐가 아니라 `dlx.exchange`로 넘어간다. 이렇게 하면 문제 메시지가 정상 흐름을 막지 않고, DLQ에 쌓인 양을 모니터링해 장애를 감지할 수도 있다.

> 수동 ACK를 쓴다면 `default-requeue-rejected: false` 설정은 필요 없다. 이 설정은 `AUTO` ack 모드에서 리스너가 예외를 던졌을 때 컨테이너가 어떻게 할지를 정하는 값이고, 수동 ACK에서는 `basicNack`/`basicReject`의 requeue 인자가 그 역할을 대신한다.

RabbitMQ 4.0부터 Quorum Queue는 기본 재전달 제한이 20으로 잡혀 있어서, 같은 메시지가 20번 재전달되면 자동으로 DLQ로 넘어간다. 클래식 큐라면 `x-delivery-limit`을 직접 지정해야 한다.

### 중복 처리 방지: 원자적으로 선점해야 한다

at-least-once 전제 때문에 컨슈머는 같은 메시지를 두 번 받을 수 있다. 메시지 ID로 중복을 거르는 방식이 흔한데, 구현에 함정이 하나 있다.

```java
// 위험한 구현: 확인과 기록 사이에 틈이 있다
if (redisTemplate.hasKey(messageId)) {   // ① 조회
    return;
}
processMessage(body);
redisTemplate.opsForValue().set(messageId, "done");  // ② 기록
```

①과 ② 사이에 다른 컨슈머가 같은 메시지를 받으면, 둘 다 ①을 통과해 둘 다 처리한다. 컨슈머를 여러 대로 띄우는 순간 언제든 발생할 수 있는 경합이다. 확인과 기록을 **하나의 원자적 연산**으로 묶어야 한다.

```java
@RabbitListener(queues = "queue1", ackMode = "MANUAL")
public void consume(final Message message, final Channel channel) throws IOException {
    final String messageId = message.getMessageProperties().getMessageId();
    final long deliveryTag = message.getMessageProperties().getDeliveryTag();

    // SETNX: 키가 없을 때만 저장하고 true를 반환한다. 조회와 기록이 한 번에 일어난다.
    final Boolean claimed = redisTemplate.opsForValue()
            .setIfAbsent(messageId, "processing", Duration.ofHours(24));

    if (!Boolean.TRUE.equals(claimed)) {
        channel.basicAck(deliveryTag, false);   // 이미 처리된 메시지
        return;
    }

    try {
        processMessage(new String(message.getBody()));
        channel.basicAck(deliveryTag, false);
    } catch (Exception e) {
        redisTemplate.delete(messageId);        // 선점 해제 후 재처리 가능하게
        channel.basicNack(deliveryTag, false, false);
    }
}
```

그래도 완벽하지는 않다. 처리에 성공한 직후 프로세스가 강제 종료되면 `catch`가 실행되지 않아 키가 TTL까지 남는다. 반대로 처리 중에 죽으면 키는 남아 있는데 처리는 안 된 상태가 되고, 재전달된 메시지가 "이미 처리됨"으로 걸러져 **유실**된다. TTL을 짧게 잡으면 중복 위험이, 길게 잡으면 유실 위험이 커지는 맞교환이다.

이 틈까지 막으려면 중복 판정을 별도 저장소가 아니라 **업무 처리와 같은 트랜잭션 안**으로 넣어야 한다. 메시지 ID를 처리 결과 테이블의 유니크 키로 두고 INSERT하면, 중복은 DB가 제약 위반으로 막아준다. 처리와 중복 기록이 하나의 트랜잭션이라 중간에 죽어도 어긋나지 않는다. Redis 방식은 DB를 건드리지 않고 가볍게 거를 수 있다는 게 장점이지, 더 안전해서 쓰는 게 아니다.

---

## 3. 브로커 구간: 받았지만 디스크에 남지 않은 경우

메시지가 메모리에만 있는 상태에서 브로커가 죽으면 그대로 사라진다. 이걸 막으려면 세 가지가 모두 필요하다.

- **Durable Queue**: 브로커가 재시작해도 큐 정의가 남는다. 큐가 사라지면 그 안의 메시지도 같이 사라진다.
- **Persistent Message**: 메시지를 디스크에 쓴다. Spring AMQP의 `RabbitTemplate`은 기본이 persistent다.
- **Publisher Confirm**: 앞의 둘을 설정해도 디스크 기록은 비동기로 일어난다. 브로커가 "디스크에 안전하게 남겼다"고 알려주는 시점이 confirm이다. confirm을 받기 전에 브로커가 죽으면 메시지는 사라질 수 있다.

```java
@Bean
public Queue durableQueue() {
    return QueueBuilder.durable("durable.queue").build();
}
```

세 가지 중 하나라도 빠지면 구멍이 남는다. durable 큐에 persistent 메시지를 넣어도 confirm을 확인하지 않으면 "보냈는데 사라진" 메시지를 발행자가 알 방법이 없다.

### 노드 장애: Mirrored Queue가 아니라 Quorum Queue

단일 노드의 디스크 기록만으로는 그 노드 자체가 복구되지 않을 때를 감당할 수 없다. 복제가 필요하다.

과거에는 클래식 큐에 HA 정책을 걸어 미러링하는 방식을 썼다.

```bash
# 더 이상 동작하지 않는다
rabbitmqctl set_policy ha-all "^" '{"ha-mode":"all"}'
```

**이 방식은 RabbitMQ 3.9에서 deprecated됐고 4.0에서 완전히 제거됐다.** 4.0 이후로는 이 정책을 걸어도 아무 효과가 없고, 클래식 큐는 복제되지 않는 단일 복제본 큐로만 동작한다. 설정은 남아 있는데 조용히 무시되는 상태라, 복제되고 있다고 믿는 쪽이 더 위험하다.

현재 복제 큐의 선택지는 Quorum Queue다. Raft 합의 알고리즘으로 과반수 노드가 상태에 동의해야 진행되므로, 미러링보다 장애 조치 동작이 예측 가능하고 데이터 안전성도 높다.

```java
@Bean
public Queue quorumQueue() {
    return QueueBuilder.durable("order.queue")
            .quorum()   // x-queue-type: quorum
            .build();
}
```

몇 가지 전제가 따라온다. 과반수 개념이 성립해야 하므로 노드는 홀수(보통 3)로 구성하고, 모든 데이터를 디스크에 쓴 뒤 진행하므로 디스크 성능이 처리량에 직접 영향을 준다. 대신 모든 큐를 quorum으로 만들 이유는 없다. 복제가 필요 없는 일시적 큐나 RPC 패턴에는 클래식 큐가 여전히 적합하다.

---

## 정리: 무엇을 내주고 무엇을 얻는가

구간별로 얻는 것과 내주는 것을 정리하면 이렇다.

| 구간 | 설정 | 얻는 것 | 내주는 것 |
| --- | --- | --- | --- |
| 발행 | Publisher Confirm | 브로커 도달 여부 확인 | 콜백 처리 로직, 약간의 지연 |
| 발행 | Mandatory + Returns | 라우팅 실패 감지 | 반환 처리 로직 |
| 발행 | Transactional Outbox | 프로세스 종료까지 보장 | 테이블과 발행 프로세스 추가 |
| 소비 | 수동 ACK | 처리 완료 후 확정 | 중복 수신 가능성 |
| 소비 | DLQ | 포이즌 메시지 격리 | DLQ 운영·재처리 체계 |
| 소비 | 멱등 처리 | 중복 방지 | 저장소 조회 또는 유니크 제약 |
| 브로커 | Durable + Persistent | 재시작 후에도 보존 | 디스크 I/O |
| 브로커 | Quorum Queue | 노드 장애 대응 | 노드 3대 이상, 디스크 부담 |

전부 켜면 안전하지만 그만큼 느려진다. 결제나 주문처럼 한 건이 어긋나면 안 되는 메시지에는 필요한 비용이고, 로그나 알림처럼 일부 유실을 감당할 수 있는 메시지에는 과한 비용이다. 하나의 브로커를 쓰더라도 큐마다 판단이 달라질 수 있다.

그리고 어떤 설정을 얹어도 결론은 at-least-once다. **유실을 막는 설정은 중복을 만들어내고, 그 중복을 감당하는 건 결국 컨슈머의 멱등성이다.** 전달 보장을 설계한다는 건 브로커 설정을 고르는 일이 아니라, 같은 메시지를 두 번 받아도 결과가 같아지도록 처리 로직을 짜는 일에 가깝다.

---

## 참고

- [RabbitMQ 공식 문서 - Publisher Confirms and Consumer Acknowledgements](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ 공식 문서 - Quorum Queues](https://www.rabbitmq.com/docs/quorum-queues)
- [RabbitMQ Blog - Quorum Queues in 4.0](https://www.rabbitmq.com/blog/2024/08/28/quorum-queues-in-4.0)
- [Spring AMQP Reference](https://docs.spring.io/spring-amqp/reference/)
