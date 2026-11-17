/* ---------------- 内置示例 ---------------- */

const SAMPLES = {
  '类图 · 电商系统': `@diagram class "电商系统类图"

abstract class BaseEntity {
  # id: String
  # createdAt: Date
  + getId(): String
}

interface Payable {
  + pay(amount: Double): Boolean
}

class User {
  - username: String
  - email: String
  + login(pwd: String): Boolean
  + logout(): void
}

class Order {
  + orderNo: String
  + total: Double
  + submit(): void
}

class OrderItem {
  + qty: Int
  + price: Double
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
}

notice 用户操作{
  用户可能退款
}

User "1" --> "*" Order : 下单
Order "1" *-- "1..*" OrderItem : 包含
Order ..|> Payable : 实现
User --|> BaseEntity : 继承
Order --> OrderStatus : 状态
用户操作 ..> OrderStatus--Order:用户退款

@layout
BaseEntity @ (177, 476) 124 60
Payable @ (431, 123) 209 60
User @ (175, 285) 190 130
Order @ (435, 286) 127 112
OrderItem @ (693, 286) 124 78
OrderStatus @ (440, 520) 124 96
用户操作 @ (678, 402) 120 46
`,

  '用例图 · 图书馆': `@diagram usecase "图书馆管理系统用例图"

boundary "图书管理系统" :solid

actor 读者
actor 管理员
actor 系统管理员

usecase 查询图书 :boundary
usecase 借阅图书 :boundary
usecase 归还图书 :boundary
usecase 续借图书 :boundary
usecase 管理图书 :boundary
usecase 管理用户 :boundary
usecase 生成报表 :boundary

读者 --> 查询图书
读者 --> 借阅图书
读者 --> 归还图书
读者 --> 续借图书
管理员 --> 管理图书
管理员 --> 管理用户
管理员 --> 生成报表
系统管理员 --> 管理用户

借阅图书 ..> 查询图书 : «include»
归还图书 ..> 查询图书 : «include»
续借图书 ..> 查询图书 : «include»

@layout
读者 @ (127, 142) 46 76
管理员 @ (950, 533) 46 76
系统管理员 @ (124, 499) 46 76
查询图书 @ (775, 130) 108 50
借阅图书 @ (504, 188) 108 50
归还图书 @ (505, 342) 108 50
续借图书 @ (506, 264) 108 50
管理图书 @ (513, 510) 108 50
管理用户 @ (514, 590) 108 50
生成报表 @ (512, 428) 108 50
boundary @ (197, 78) 687 557

`,

  '活动图 · 订单处理': `@diagram activity "订单处理流程"

# boundary "订单处理系统"
swimlane "用户" :v
swimlane "系统" :v

start in "用户"
:接收用户订单; in "用户"
:校验订单参数; in "用户"
if (库存是否充足?) in "系统"
  :锁定库存; in "系统"
  :生成支付单; in "系统"
  if (支付是否成功?) in "系统"
    :更新订单状态为已支付; in "系统"
    :通知仓库发货; in "系统"
  else
    :释放库存; in "系统"
    :订单关闭; in "系统"
  endif
else
  :提示用户缺货; in "用户"
  :推荐相似商品; in "用户"
endif
:发送结果通知; in "用户"
stop in "用户"

@layout
lane 用户 @ (-135, 118) 369 868
lane 系统 @ (234, 118) 382 869
start_1 @ lane 用户 (179, 61) 26 26
act_2 @ lane 用户 (179, 126) 118 46
act_3 @ lane 用户 (181, 244) 118 46
dec_4 @ lane 系统 (182, 93) 120 74
act_5 @ lane 系统 (183, 209) 96 46
act_6 @ lane 系统 (189, 286) 105 46
dec_7 @ lane 系统 (189, 380) 120 74
act_8 @ lane 系统 (113, 539) 170 46
act_9 @ lane 系统 (117, 660) 118 46
act_10 @ lane 系统 (300, 538) 96 46
act_11 @ lane 系统 (306, 777) 96 46
act_12 @ lane 用户 (188, 376) 118 46
act_13 @ lane 用户 (188, 531) 118 46
act_14 @ lane 用户 (188, 657) 118 46
stop_15 @ lane 用户 (189, 778) 26 26

`,

  'E-R 图 · 电商数据库': `@diagram er "电商数据库 E-R 图"

entity 用户 {
  * id: BIGINT «PK»
  username: VARCHAR(50)
  email: VARCHAR(120)
  created_at: DATETIME
}

entity 订单 {
  * id: BIGINT «PK»
  user_id: BIGINT «FK»
  total: DECIMAL(10,2)
  status: TINYINT
}

entity 订单项 {
  * id: BIGINT «PK»
  order_id: BIGINT «FK»
  product_id: BIGINT «FK»
  qty: INT
}

entity 商品 {
  * id: BIGINT «PK»
  title: VARCHAR(200)
  price: DECIMAL(10,2)
  stock: INT
}

database Data{
  磁盘存储
}

用户 ||--o{ 订单 : "下单"
订单 ||--|{ 订单项 : "包含"
商品 ||--o{ 订单项 : "被购买"
订单项 --> Data : 存储信息

@layout
用户 @ (147, 309) 164 122
订单 @ (146, 506) 141 122
订单项 @ (615, 153) 161 122
商品 @ (144, 157) 143 122
Data @ (620, 529) 140 62

`,

  '顺序图 · 订货处理': 
`

@diagram sequence "订货处理的顺序图"

actor 采购员
boundary 商务管理界面
boundary 订货界面
control 订货管理器
control 客户
control 货品
control 订单货品
control 订单
object 财务系统

采购员 ->* 商务管理界面 : 订货() 
商务管理界面 ->* 订货管理器 : 订货()
订货管理器 ->* 订单 : 创建订单 (订单编号，订货日期，采购员)
订货管理器 --> 订货界面 : 弹出订货界面()

采购员 ->* 订货界面 : 客户信息() 
订货界面 ->* 订货管理器 : 接收客户信息()
订货管理器 ->* 客户 : 创建客户()

loop
    采购员 ->* 订货界面 : 选择货品 (货品编号) 
    订货界面 ->* 订货管理器 : 选择货品 (货品编号)
    订货管理器 ->* 货品 : 取货品信息 (货品编号)
    货品 --> 订货管理器 : 货品信息()
    
    订货管理器 ->* 订单货品 : 创建订单货品 (货品编号，订单编号，数量)
    订货管理器 --> 订货界面 : 显示货品信息()
end

采购员 ->* 订货界面 : 付款 (账户，金额)
订货界面 ->* 订货管理器 : 付款 (账户，金额)
订货管理器 ->* 财务系统 : 付款 (账户，金额)

@layout
lifeBottom 1038
participant 采购员 @ (552, 125) 140 96
participant 商务管理界面 @ (663, 119) 159 96
participant 订货界面 @ (773, 121) 140 96
participant 订货管理器 @ (873, 122) 146 96
participant 客户 @ (955, 120) 140 96
participant 货品 @ (1023, 120) 140 96
participant 订单货品 @ (1107, 121) 140 96
participant 订单 @ (1193, 122) 140 96
participant 财务系统 @ (1313, 117) 140 96
message 0 @ (_, 208)
message 1 @ (_, 248)
message 2 @ (_, 288)
message 3 @ (_, 328)
message 4 @ (_, 368)
message 5 @ (_, 408)
message 6 @ (_, 448)
message 7 @ (_, 528)
message 8 @ (_, 568)
message 9 @ (_, 608)
message 10 @ (_, 648)
message 11 @ (_, 688)
message 12 @ (_, 728)
message 13 @ (_, 808)
message 14 @ (_, 848)
message 15 @ (_, 888)
activation 0 @ (_, 225) 52
activation 1 @ (_, 368) 40
activation 2 @ (_, 528) 40
activation 3 @ (_, 205) 722
activation 4 @ (_, 208) 80
activation 5 @ (_, 248) 120
activation 6 @ (_, 408) 80
activation 7 @ (_, 568) 200
activation 8 @ (_, 848) 80
activation 9 @ (_, 288) 40
activation 10 @ (_, 328) 120
activation 11 @ (_, 528) 80
activation 12 @ (_, 728) 40
activation 13 @ (_, 808) 80
activation 14 @ (_, 448) 40
activation 15 @ (_, 608) 80
activation 16 @ (_, 688) 40
activation 17 @ (_, 888) 40
fragment 0 @ (471, 510) 883 261


`,

  '状态图 · 订单状态': `@diagram state "订单状态机"

[*] --> 待支付
待支付 --> 已支付 : 支付成功
待支付 --> 已取消 : 超时/取消
已支付 --> 已发货 : 仓库发货
已发货 --> 已完成 : 用户签收
已发货 --> 退货中 : 申请退货
退货中 --> 已退款 : 退款成功
已支付 --> 已退款 : 主动退款
已取消 --> [*]
已完成 --> [*]
已退款 --> [*]
`,

  '组件图 · 微服务': `
 @diagram component "微服务架构组件图"

component 网关服务 {
  + 路由转发
  + 鉴权过滤
}

component 用户服务 {
  + 用户注册
  + 用户登录
}

component 订单服务 {
  + 创建订单
  + 查询订单
}

component 支付服务 {
  + 发起支付
  + 支付回调
}

component 消息队列
component 配置中心
component 数据库

网关服务 ..> 用户服务 : HTTP
网关服务 ..> 订单服务 : HTTP
订单服务 ..> 支付服务 : RPC
订单服务 --> 消息队列 : 发布事件
支付服务 --> 消息队列 : 发布事件
用户服务 --> 数据库 : JDBC
订单服务 --> 数据库 : JDBC
网关服务 ..> 配置中心 : 拉取配置

@layout
网关服务 @ (284, 324) 124 78
用户服务 @ (284, 141) 124 78
订单服务 @ (530, 324) 124 78
支付服务 @ (283, 531) 124 78
消息队列 @ (531, 534) 124 44
配置中心 @ (72, 320) 124 44
数据库 @ (527, 141) 124 44

`,

  '部署图 · 生产环境': `@diagram deployment "生产环境部署图"

node 客户端 {
  artifact 浏览器
  artifact 移动App
}

node 负载均衡 {
  artifact Nginx
}

node 应用服务器 {
  artifact 用户服务.jar
  artifact 订单服务.jar
}

node 数据库服务器 {
  database MySQL
  database Redis
}

客户端 --> 负载均衡 : HTTPS
负载均衡 --> 应用服务器 : HTTP
应用服务器 --> 数据库服务器 : TCP
`,

  '对象图 · 快照': `@diagram object "订单对象快照"

object 用户张三 {
  id = "U1001"
  name = "张三"
  vipLevel = 3
}

object 订单A {
  orderNo = "SO20240001"
  total = 299.00
  status = "PAID"
}

object 商品X {
  sku = "SKU-001"
  price = 299.00
}

用户张三 --> 订单A : 拥有
订单A --> 商品X : 包含
`,

  '包图 · 分层架构': `@diagram package "系统分层包图"

package 表现层 {
  class UserController
  class OrderController
}

package 业务层 {
  class UserService
  class OrderService
}

package 数据层 {
  class UserRepository
  class OrderRepository
}

表现层 ..> 业务层 : 调用
业务层 ..> 数据层 : 调用
`};

const sampleSelect = document.getElementById('samples');
const ph = document.createElement('option');
ph.textContent = '载入示例…';
ph.value = '';
sampleSelect.appendChild(ph);
for (const name of Object.keys(SAMPLES)) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  sampleSelect.appendChild(o);
}
sampleSelect.addEventListener('change', () => {
  const name = sampleSelect.value;
  if (!name) return;
  // 有文件区时：示例落成一张新图，别覆盖当前正在改的那张
  if (typeof fsImportSingle === 'function') {
    fsImportSingle(SAMPLES[name], name + '.uml');
    if (typeof setStatus === 'function') setStatus(`已载入示例「${name}」，存为一张新图`, 'ok');
  } else {
    editor.value = SAMPLES[name];
    render();
  }
  sampleSelect.value = '';
});