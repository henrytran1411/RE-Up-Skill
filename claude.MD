# Yêu Cầu Dự Án: Hệ Thống Đánh Giá Năng Lực & Cống Hiến Lập Trình Viên (DevPerf System)

## 1. Tổng quan dự án (Project Overview)
Hệ thống **DevPerf System** được xây dựng nhằm mục đích số hóa và tự động hóa quy trình đánh giá năng lực, đóng góp và lộ trình thăng tiến của các lập trình viên trong công ty. Hệ thống cung cấp một góc nhìn 360 độ về nhân sự, từ hiệu suất làm việc trong dự án, thời gian rảnh (bench time), đến khả năng học hỏi và kỹ năng mềm.

## 2. Công nghệ sử dụng (Tech Stack)
* **Frontend:** ReactJS (hoặc VueJS). Ưu tiên thiết kế Component-based, sử dụng các thư viện UI (như Ant Design, Material-UI) để xây dựng Dashboard thống kê trực quan.
* **Backend:** NodeJS (Express/NestJS). Thiết kế theo chuẩn RESTful API, có khả năng mở rộng để tích hợp các service phân tích dữ liệu sau này.
* **Database:** PostgreSQL.
* **Infrastructure/Cloud:** Sẵn sàng để triển khai trên các nền tảng đám mây (Cloud) với khả năng quản lý API tập trung.

## 3. Các thực thể cốt lõi (Core Entities)
Hệ thống xoay quanh các domain chính sau:

* **Employee (Lập trình viên):** Thông tin cá nhân, chức danh (Junior, Middle, Senior), dự án đang tham gia.
* **Task/Project History:** Lịch sử hoàn thành công việc, bug rate, chất lượng code (có thể tích hợp sau).
* **Skill Matrix (Ma trận kỹ năng):** * Kỹ năng đang có (Current Skills).
    * Kỹ năng đang học (Learning/Target Skills).
    * Mức độ thành thạo (1-5).
* **Bench Time (Thời gian không có dự án):** Log chi tiết lập trình viên làm gì khi ở trạng thái bench (học công nghệ mới, hỗ trợ dự án khác, làm internal tools).
* **Evaluation Path (Lộ trình đánh giá):** Các mốc thời gian đánh giá (Quý, Bán niên, Hàng năm).

## 4. Logic Nghiệp Vụ & Trọng Số Đánh Giá (Business Logic & Weighting)
Việc tính điểm đánh giá (Performance Score) sẽ dựa trên công thức có trọng số. Trọng số này có thể tùy chỉnh, nhưng cấu trúc cơ bản như sau:

### 4.1. Phân loại Cấp độ (Levels)
Hệ thống áp dụng các tiêu chuẩn khác nhau cho từng cấp độ:
* **Junior:** Trọng số tập trung vào khả năng học hỏi (Learning rate), tuân thủ deadline, và sự chủ động.
* **Middle:** Tập trung vào chất lượng task, khả năng giải quyết vấn đề độc lập, kỹ năng core.
* **Senior:** Trọng số cao ở khả năng kiến trúc, dẫn dắt team, tối ưu hóa hệ thống và cống hiến cho công ty.

### 4.2. Khung Trọng Số Tiêu Chuẩn (Ví dụ)
1.  **Hiệu suất công việc & Hoàn thành Task (40%):** Dựa trên đánh giá của PM, thời gian hoàn thành so với estimate, độ phức tạp của task.
2.  **Kỹ năng Chuyên môn & Học tập (30%):**
    * Sự phát triển của *Current Skills*.
    * Tốc độ hoàn thành các khóa học hoặc chứng chỉ mới (*Target Skills*).
3.  **Kỹ năng Mềm & Tiếng Anh (15%):** Tiếng Anh là một kỹ năng quan trọng (Key Skill) được cấp hệ số nhân cao (multiplier) nếu đạt các chứng chỉ hoặc giao tiếp tốt trong dự án.
4.  **Tối ưu hóa Bench Time (15%):** Đánh giá thái độ và kết quả sinh ra trong thời gian không có dự án. Một Senior làm ra internal tool trong giờ bench sẽ có điểm cao hơn việc chỉ đọc tài liệu thụ động.

## 5. Các Tính năng chính (Key Features)
1.  **Dashboard Cá nhân (Dành cho Developer):**
    * Xem điểm số hiện tại và radar chart các kỹ năng.
    * Cập nhật tiến độ học tập (ví dụ: đang học ReactJS, đã hoàn thành 50%).
    * Khai báo công việc trong thời gian Bench.
2.  **Dashboard Quản lý (Dành cho PM/Tech Lead/HR):**
    * Theo dõi toàn bộ resource.
    * Phê duyệt các kỹ năng mới mà dev tự khai báo.
    * Thực hiện kỳ đánh giá (Review cycles) dựa trên dữ liệu hệ thống tổng hợp.
3.  **Hệ thống Cảnh báo & Gợi ý (Alert & Suggestion):**
    * Cảnh báo nếu một dev ở trạng thái bench quá lâu mà không có hoạt động học tập.
    * Gợi ý lộ trình (Roadmap) để từ Junior lên Middle dựa trên bộ kỹ năng còn thiếu.

## 6. Hướng dẫn cho LLM (Instructions for AI Assistants)
Khi làm việc với dự án này, hãy tuân thủ các nguyên tắc sau:
* **Code Style:** Ưu tiên code sạch (Clean Code), áp dụng SOLID principles cho Backend và Custom Hooks/HOCs cho Frontend (nếu dùng React).
* **API Design:** Luôn kiểm tra tính xác thực và phân quyền (Role-based Access Control) vì dữ liệu đánh giá rất nhạy cảm.
* **Bảo mật:** Không log các thông tin nhạy cảm. 
* **Tư duy hệ thống:** Luôn nghĩ về edge cases (VD: Một dev thay đổi level giữa kỳ đánh giá thì hệ thống tính điểm theo tỷ lệ tháng như thế nào?).