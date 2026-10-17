# UMLite 语言规范 v1.0

> **UMLite** 是一种文本驱动的 UML 绘图语言。一份 `.uml` 文档由「图类型声明」与「语句体」两部分组成，
> 解析器读取文档后直接生成对应的 UML 图形。

---

## 1. 文档结构

```
@diagram <类型> ["图标题"]

<语句 1>
<语句 2>
...
```

| 规则 | 说明 |
|---|---|
| 首行 | **必须**是 `@diagram` 声明 |
| 图标题 | 可选，用双引号包裹 |
| 空行 | 忽略 |
| 注释 | 以 `//` 或 `#` 开头的整行 |
| 缩进 | 无意义，解析前会被去除首尾空白 |
| 标识符 | 含空格或特殊字符时用双引号包裹，如 `"订单 服务"` |

### 1.1 图类型关键字

| 类型关键字 | 对应 UML 图 | 可用别名 |
|---|---|---|
| `class` | 类图 | `classdiagram`、`类图` |
| `usecase` | 用例图 | `用例图` |
| `activity` | 活动图 | `活动图` |
| `er` | E-R 图 | `erdiagram`、`实体关系图`、`er图` |
| `sequence` | 时序图 | `时序图`、`序列图` |
| `state` | 状态图 | `状态图`、`statechart` |
| `component` | 组件图 | `组件图` |
| `deployment` | 部署图 | `部署图` |
| `object` | 对象图 | `对象图` |
| `package` | 包图 | `包图` |

---

## 2. 关系运算符总览

所有图类型共享同一套关系运算符（部分图类型有专用运算符，见各章节）。

| 运算符 | 名称 | 语义 | 线型 |
|---|---|---|---|
| `--` | 关联 | 一般关联 | 实线，无箭头 |
| `-->` | 有向关联 | 有方向的一般关联 | 实线，开箭头 |
| `--\|>` | 继承 / 泛化 | is-a 关系 | 实线，空心三角 |
| `..\|>` | 实现 | 接口实现 | 虚线，空心三角 |
| `..>` | 依赖 | 使用关系 | 虚线，开箭头 |
| `*--` | 组合 | 强聚合，整体-部分 | 实线，实心菱形（在左端） |
| `o--` | 聚合 | 弱聚合，整体-部分 | 实线，空心菱形（在左端） |
| `..` | 虚线关联 | 弱关联 | 虚线，无箭头 |

### 2.1 反向箭头

以下反向写法会被自动规整为正向：

```
<--  →  -->          <|-- →  --|>
<|.. →  ..|>         <..  →  ..>
<-   →  ->           --*  →  *--        --o  →  o--
```

### 2.2 边的修饰

关系行可以在端点处添加**多重度**，在末尾添加**标签**：

```
A "1" --> "0..*" B : 关联标签
```

- 左多重度写在左端点标识符**之后**，用双引号包裹。
- 右多重度写在右端点标识符**之前**，用双引号包裹。
- 标签写在整行**末尾**，以冒号 `:` 引导。
- 三段均可省略。

---

## 3. 类图（class）

### 3.1 节点声明

```
<关键字> <名称> [{
    <成员 1>
    <成员 2>
}]
```

支持的声明关键字：

| 关键字 | 含义 |
|---|---|
| `class` | 类 |
| `abstract class` | 抽象类（标题前显示 «abstract»） |
| `interface` | 接口 |
| `enum` | 枚举 |
| `struct` | 结构体 |
| `annotation` | 注解 |
| `trait` | 特征 |

成员行的文本会被原样显示在类框中，建议使用 UML 可见性前缀：

| 前缀 | 可见性 |
|---|---|
| `+` | public |
| `-` | private |
| `#` | protected |
| `~` | package |

### 3.2 示例

```
@diagram class "电商系统类图"

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
    + login(pwd: String): Boolean
}

class Order {
    + orderNo: String
    + total: Double
}

class OrderItem {
    + qty: Int
}

enum OrderStatus {
    PENDING
    PAID
}

User "1" --> "*" Order : 下单
Order "1" *-- "1..*" OrderItem : 包含
Order ..|> Payable : 实现
User --|> BaseEntity : 继承
Order --> OrderStatus : 状态
```

### 3.3 隐式声明

在关系行中直接引用的名称，如果此前未声明，会自动创建为一个空类节点。因此下面两段等价：

```
User --> Order
```

```
class User
class Order
User --> Order
```

---

## 4. 用例图（usecase）

### 4.1 语法

```
boundary "系统名称" [:solid | :dashed]
usecase <用例名> [:boundary]
actor <角色名>
<角色> --> <用例>
<用例> ..> <用例> : «include» | «extend»
```

- `boundary` 声明系统边界框（可选的），系统名称显示在矩形框的左上角。
  - 线型默认**虚线**；在末尾追加 `:solid` 可改为**实线**，追加 `:dashed` 则显式指定**虚线**。
  - 边界框的**四角**可用于拖拽，实时调整边界大小。
- `usecase` 后加 `:boundary` 后缀标记此用例属于系统内部，会被包裹在边界框内。
- 未加 `:boundary` 的 `usecase` 和所有 `actor` 默认渲染在边界框**外部**。
- 角色与用例之间常用 `-->`（关联）。
- 用例之间常用 `..>` 并标注 `«include»` / `«extend»`。

### 4.2 示例（含系统边界）

```
@diagram usecase "图书馆管理系统用例图"

boundary "图书管理系统" :solid

actor 读者
actor 管理员

usecase 查询图书 :boundary
usecase 借阅图书 :boundary
usecase 归还图书 :boundary
usecase 管理图书 :boundary

读者 --> 查询图书
读者 --> 借阅图书
读者 --> 归还图书
管理员 --> 管理图书

借阅图书 ..> 查询图书 : «include»
归还图书 ..> 查询图书 : «include»
```

---

## 5. 活动图（activity）

活动图使用**专用语句**，不采用「节点 + 关系」的写法。

### 5.1 语句一览

| 语句 | 说明 |
|---|---|
| `start` | 起始节点（实心圆） |
| `stop` / `end` / `end.` | 结束节点（牛眼圆） |
| `:动作名;` | 动作节点（圆角矩形），结尾分号可省略 |
| `if (条件)` | 判断节点（菱形），后续分支默认标注「是」 |
| `else` | 否则分支，标注「否」 |
| `endif` | 结束 if 块 |
| `while (条件)` | 循环判断节点 |
| `endwhile` | 结束循环，回边自动连回 `while` |
| `note: 文本` | 备注节点 |
| `boundary "名称"` | 活动边：实线圆角边框，标识活动范围（只实线，不可调线型），可四角拖拽调大小 |
| `swimlane "名称" [:h \| :v]` | 泳道：分区分道，默认水平 `:h`（横条），可 `:v` 指定垂直（竖条）开口方向 |
| 任意活动元素行末尾追加 `in "泳道名"` | 把该元素归入指定泳道（详见 5.5.1）；缺省沿用上一次指定的泳道 |

### 5.2 分支结构

```
if (条件)
    :分支 A;
else
    :分支 B;
endif
```

`if` 与 `endif` 必须配对，`else` 可选。允许嵌套。

### 5.3 循环结构

```
while (还有下一页?)
    :读取一页数据;
endwhile
```

### 5.4 示例

```
@diagram activity "订单处理流程"

start
:接收用户订单;
:校验订单参数;
if (库存是否充足?)
    :锁定库存;
    :生成支付单;
    if (支付是否成功?)
        :更新订单状态为已支付;
        :通知仓库发货;
    else
        :释放库存;
        :订单关闭;
    endif
else
    :提示用户缺货;
    :推荐相似商品;
endif
:发送结果通知;
stop
```

### 5.5 活动边与泳道

活动边用于框定整个活动流程的范围，泳道用于为流程分道（如按参与者分区）。

```
@diagram activity "订单处理"

boundary "订单处理系统"
swimlane "用户" :h
swimlane "系统" :h
swimlane "商城" :v

start
:用户提交订单;
:系统校验;
:商城发货;
stop
```

- `swimlane "名称"` 默认水平泳道（横条，自上而下分区）；追加 `:v`（或 `:vertical`）为垂直泳道（竖条，自左向右分区）。
- 泳道作为独立元素：渲染在**最底层**、可整体拖动、可四角调整大小；拖动时靠近方向相同的其他泳道会自动吸附合并。
- 活动边固定为**实线**边框，标签显示在左上角，仅用于框定活动范围。

### 5.5.1 把活动元素放入泳道

参照用例图中用 `: boundary` 把元素放进边界的方式，活动图可在**任意元素行末尾**追加 `in "泳道名"`，把该元素归入指定泳道；若某行不写，则沿用上一次指定的泳道（默认不属于任何泳道）。

```
@diagram activity "订单处理"

boundary "订单处理系统"
swimlane "用户" :h
swimlane "系统" :h

start in "用户"
:接收用户订单; in "用户"
:校验订单参数; in "用户"
if (库存是否充足?) in "系统"
  :锁定库存; in "系统"
  :释放库存; in "系统"
endif
:发送结果通知; in "用户"
stop in "用户"
```

行为约定：

- **可归入泳道的元素**：`start`、`stop`、动作（`:动作;`）、判断（`if`/`while`）、备注（`note`）等所有活动节点；`boundary`、`swimlane` 声明行不参与。
- **约束范围（拖动不可超出泳道）**：归入泳道的元素被限制在其泳道矩形范围内拖动，无法越界。
- **相对静止（拖泳道带元素一起动）**：整体拖动泳道时，归入该泳道内的元素会同步平移、保持相对位置不变；连线仍按连接关系动态更新。
- `in "泳道名"` 中的泳道名需与上方 `swimlane "名称"` 的声明一致。

---

## 6. E-R 图（er）

### 6.1 语法

```
entity <实体名> {
    <字段定义>
}
```

- `database`、`table` 关键字与 `entity` 等价。
- 实体渲染为矩形，实体名显示在表头。
- 关系使用 Chen 记法风格的基数运算符：

| 运算符 | 含义 |
|---|---|
| `\|\|--o{` | 一对多（可选） |
| `\|\|--\|{` | 一对多（强制） |
| `\|\|--\|\|` | 一对一 |

### 6.2 示例

```
@diagram er "电商数据库 E-R 图"

entity 用户 {
    * id: BIGINT «PK»
    username: VARCHAR(50)
    email: VARCHAR(120)
}

entity 订单 {
    * id: BIGINT «PK»
    user_id: BIGINT «FK»
    total: DECIMAL(10,2)
}

entity 订单项 {
    * id: BIGINT «PK»
    order_id: BIGINT «FK»
    product_id: BIGINT «FK»
}

用户 ||--o{ 订单 : "下单"
订单 ||--|{ 订单项 : "包含"
```

---

## 7. 时序图（sequence）

### 7.1 语法

```
participant <显示名> [as <短名>]
actor <显示名> [as <短名>]
<发送方> -> <接收方> : 消息文本
<发送方> --> <接收方> : 返回消息
```

- `participant` 与 `actor` 等价，均渲染为顶部矩形框 + 下方虚线生命线。
- `->` 表示同步消息（实线箭头）。
- `-->` 表示返回消息（虚线箭头）。
- 参与者顺序按首次出现顺序排列。
- `as` 用于给带空格的显示名指定一个简短的引用名。

### 7.2 示例

```
@diagram sequence "用户登录时序图"

participant 用户
participant 浏览器 as Browser
participant 网关 as Gateway
participant 认证服务 as AuthService
participant 数据库 as DB

用户 -> Browser : 输入账号密码
Browser -> Gateway : POST /api/login
Gateway -> AuthService : 转发登录请求
AuthService -> DB : 查询用户记录
DB --> AuthService : 返回用户数据
AuthService --> Gateway : 签发 JWT Token
Gateway --> Browser : 200 OK + Token
Browser --> 用户 : 跳转首页
```

---

## 8. 状态图（state）

### 8.1 语法

```
state <状态名>
<状态 A> --> <状态 B> : 迁移事件
[*] --> <初始状态>
<终止状态> --> [*]
```

- `[*]` 表示伪状态：位于左侧时渲染为起始节点，位于右侧时渲染为终止节点。
- 未显式声明的状态会自动创建。

### 8.2 示例

```
@diagram state "订单状态机"

[*] --> 待支付
待支付 --> 已支付 : 支付成功
待支付 --> 已取消 : 超时/取消
已支付 --> 已发货 : 仓库发货
已发货 --> 已完成 : 用户签收
已发货 --> 退货中 : 申请退货
退货中 --> 已退款 : 退款成功
已取消 --> [*]
已完成 --> [*]
已退款 --> [*]
```

---

## 9. 组件图（component）

### 9.1 语法

```
component <组件名> [{
    <成员>
}]
<组件 A> ..> <组件 B> : 依赖说明
```

组件使用**紫色标题栏 + 左侧组件图标**样式（两个小矩形）。

### 9.2 示例

```
@diagram component "微服务架构组件图"

component 网关服务 {
    + 路由转发
    + 鉴权过滤
}

component 用户服务 {
    + 用户注册
}

component 订单服务 {
    + 创建订单
}

component 数据库

网关服务 ..> 用户服务 : HTTP
网关服务 ..> 订单服务 : HTTP
订单服务 --> 数据库 : JDBC
```

---

## 10. 部署图（deployment）

### 10.1 语法

```
node <节点名> [{
    artifact <构件名>
}]
artifact <构件名>
database <数据库名>
```

节点与构件均可参与关系连线。

### 10.2 示例

```
@diagram deployment "生产环境部署图"

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
```

---

## 11. 对象图（object）

### 11.1 语法

```
object <对象名> [{
    <属性> = <值>
}]
<对象 A> --> <对象 B> : 链接名
```

### 11.2 示例

```
@diagram object "订单对象快照"

object 用户张三 {
    id = "U1001"
    name = "张三"
}

object 订单A {
    orderNo = "SO20240001"
    total = 299.00
}

用户张三 --> 订单A : 拥有
```

---

## 12. 包图（package）

### 12.1 语法

```
package <包名> [{
    class <类名>
}]
<包 A> ..> <包 B> : 依赖说明
```

### 12.2 示例

```
@diagram package "系统分层包图"

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
```

---

## 13. 便签框（notice）

### 13.1 语法

```
notice <标题>
notice <标题> {
    <内容行 1>
    <内容行 2>
}
<任意元素> --> <notice 标题> : 关联说明
```

- `notice` 在所有图类型中均可使用。
- 渲染为右上角有**折角**的黄色便签框。
- 通过关系运算符可与其他元素自由连接。

### 13.2 示例

```
@diagram class "订单系统设计备注"

class Order {
    + orderNo: String
    + total: Double
}

notice "待讨论" {
    - 是否需要支持分表?
    - 并发扣库存场景
}

notice "已确认" {
    使用分布式锁方案
}

Order --> 待讨论 : 关联
待讨论 ..> 已确认 : 推进
```

---

## 14. 完整示例（综合）

```
@diagram class "订单领域模型"

abstract class BaseEntity {
    # id: String
    # createdAt: Date
}

interface Payable {
    + pay(amount: Double): Boolean
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

Order "1" *-- "1..*" OrderItem : 包含
Order ..|> Payable : 实现
Order --|> BaseEntity : 继承
Order --> OrderStatus : 状态
```

---

## 14. 解析错误提示

| 错误信息 | 原因 |
|---|---|
| `文档为空，请先写入 @diagram ...` | 文件中没有任何有效语句 |
| `缺少图类型声明，格式应为 @diagram <类型> "标题"` | 首行不是合法的 `@diagram` 声明 |
| `未知的图类型 "xxx"` | 类型关键字不在别名表中 |
| `第 N 行：xxx 缺少名称` | 节点声明后没有跟标识符 |
| `第 N 行：缺少匹配的 "}"` | 代码块未闭合 |
| `第 N 行：else 没有匹配的 if` | 活动图中 `else` 未与 `if` 配对 |
| `第 N 行：endif 没有匹配的 if` | 活动图中 `endif` 未与 `if` 配对 |
| `第 N 行：endwhile 没有匹配的 while` | 活动图中 `endwhile` 未与 `while` 配对 |

---

## 15. 位置定义（@layout）

`@layout` 位置块用于**预定义元素的默认渲染位置**。它：

- 必须追加在源码**末尾**，不影响图主体解析；
- 使用**绝对坐标**（绝对于画布坐标系）；
- **非必需**：可以没有、有部分、或全部元素都有；未定位的元素仍按原有逻辑自动布局；
- 只影响**默认渲染位置**，用户仍可自由拖动；刷新渲染后会回到位置块定义的位置；
- 支持**双向解析**：位置块可被解析渲染到画布；元素被拖动后导出 `.uml` 会自动合并写上当前位置块，从而保存用户看到的图形。

### 15.0 二级定位（泳道内元素）

活动图内部元素（动作 `:xxx`、判断、开始/结束 `[*]` 等）没有自然名称，但每个元素都有一个由 DSL 结构**自动生成、稳定不变的内部 id**（如 `act_1`、`dec_2`、`start_1`）。对这些元素，**以它所在的泳道作为画布**做**二级定位**：

```
@layout
<元素id> @ lane <泳道名> (x, y) [宽 高]
```

- `(x, y)`、`宽 高` 都**相对该泳道的左上角**；
- 最终绝对位置 = **泳道位置 + 相对坐标**（泳道本身仍可用一级定位覆盖，最终坐标自动跟随泳道移动/缩放）；
- 元素 id 与 DSL 主体结构一一对应：只要你不改动主体结构（增删动作/分支等），id 与位置都可双向稳定还原；若改动结构导致元素 id 重排，仅该元素位置失效，不会报错。

例如「15.4 下单流程」中，可在 `@layout` 块里微调泳道内动作位置：

```plantuml
@layout
lane 客户 @ (100, 60) 380 540
lane 仓库 @ (490, 60) 380 540
boundary @ (60, 30) 860 620
act_1 @ lane 客户 (60, 120) 150 46
act_2 @ lane 客户 (60, 240) 150 46
```

### 15.1 语法

```
@layout
<元素引用> @ (x, y) [宽 高]
```

- `@layout` 为块标记，其后每一行定义一个元素的位置；
- 括号内 `(x, y)` 为**横向、纵向坐标**；
- 可选地跟两个数 `宽 高`，用于指定尺寸；
- 坐标系语义：
  - **类/对象/用例/状态/组件/部署等普通元素**：`(x, y)` 为元素**中心点**，`宽 高` 为整体宽高；
  - **`boundary`（系统边界框 / 活动图活动边）**：`(x, y)` 为**左上角**，`宽 高` 为整体宽高；
  - **`lane 泳道名`（活动图泳道）**：`(x, y)` 为**左上角**，`宽 高` 为整体宽高；
- 无法识别的行会被宽松忽略。

### 15.2 各图的支持范围

| 图类型 | 可定位对象 |
|---|---|
| 类 / 用例 / 状态 / 组件 / 部署 / 对象 / 包图 | 具名节点 + `boundary`（系统边界框） |
| 活动图 | **仅泳道**（`lane 泳道名`）与活动边（`boundary`）。泳道内元素不支持定位，仍采用默认布局（自动收拢进泳道） |
| 时序图 | 不支持 |

### 15.3 示例（类图）

```plantuml
@diagram class "订单系统"
class Order {
  id:long
  status:int
}
class User
Order --> User

@layout
Order @ (300, 250) 220 120
User @ (580, 250)
boundary @ (150, 100) 680 360
```

### 15.4 示例（活动图，仅泳道）

```plantuml
@diagram activity "下单流程"
if (下单) then (是)
  :支付;
endif

lane 客户 @ start
 :浏览商品;
 :提交订单;
lane 仓库 @ end

@layout
lane 客户 @ (100, 60) 380 540
lane 仓库 @ (490, 60) 380 540
boundary @ (60, 30) 860 620
```

---

*UMLite v1.0 · 文本驱动 UML 绘图工具*