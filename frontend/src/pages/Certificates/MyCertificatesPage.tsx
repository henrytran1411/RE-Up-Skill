import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { CertificateHistoryChart } from '../../components/CertificateHistoryChart';
import {
  createCertificate,
  deleteCertificate,
  fetchMyCertificateYearlySummary,
  fetchMyCertificates,
  updateCertificate,
  uploadCertificateImage,
} from '../../services/certificateService';
import { CertificateYearSummary, EmployeeCertificate } from '../../types/certificate';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function MyCertificatesPage() {
  const [certificates, setCertificates] = useState<EmployeeCertificate[]>([]);
  const [yearlySummary, setYearlySummary] = useState<CertificateYearSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<EmployeeCertificate | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [myCertificates, summary] = await Promise.all([fetchMyCertificates(), fetchMyCertificateYearlySummary()]);
      setCertificates(myCertificates);
      setYearlySummary(summary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalPoints = yearlySummary.reduce((sum, s) => sum + s.totalPoints, 0);
  const verifiedCount = certificates.filter((c) => c.isVerified).length;
  const pendingCount = certificates.length - verifiedCount;

  const openCreateModal = () => {
    setEditingCertificate(null);
    setImageUrl(null);
    setFileList([]);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (certificate: EmployeeCertificate) => {
    setEditingCertificate(certificate);
    setImageUrl(certificate.imageUrl);
    setFileList([{ uid: certificate.id, name: certificate.name, status: 'done', url: certificate.imageUrl }]);
    form.setFieldsValue({
      name: certificate.name,
      description: certificate.description ?? undefined,
      expiredDate: dayjs(certificate.expiredDate),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!imageUrl) {
      message.error('Please upload a certificate image');
      return;
    }
    const payload = {
      name: values.name,
      description: values.description,
      expiredDate: values.expiredDate.format('YYYY-MM-DD'),
      imageUrl,
    };
    setSaving(true);
    try {
      if (editingCertificate) {
        await updateCertificate(editingCertificate.id, payload);
        message.success('Certificate updated');
      } else {
        await createCertificate(payload);
        message.success('Certificate submitted — awaiting Admin verification');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save certificate'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (certificate: EmployeeCertificate) => {
    try {
      await deleteCertificate(certificate.id);
      message.success('Certificate deleted');
      loadData();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete certificate'));
    }
  };

  return (
    <Row gutter={[24, 24]}>
      <Col span={24}>
        <Card>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Total Certificate Points" value={totalPoints} valueStyle={{ color: '#13c2c2' }} />
            </Col>
            <Col span={8}>
              <Statistic title="Verified Certificates" value={verifiedCount} />
            </Col>
            <Col span={8}>
              <Statistic title="Pending Verification" value={pendingCount} />
            </Col>
          </Row>
        </Card>
      </Col>

      <Col span={24}>
        <Card title="My Certificate Points by Year">
          <CertificateHistoryChart summaries={yearlySummary} />
        </Card>
      </Col>

      <Col span={24}>
        <Card
          title="My Certificates"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Add Certificate
            </Button>
          }
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={certificates}
            columns={[
              {
                title: 'Image',
                dataIndex: 'imageUrl',
                render: (url: string) => <Image src={url} width={48} height={48} style={{ objectFit: 'cover' }} />,
              },
              { title: 'Name', dataIndex: 'name' },
              { title: 'Description', dataIndex: 'description', render: (v: string | null) => v ?? '—' },
              { title: 'Expires', dataIndex: 'expiredDate' },
              {
                title: 'Status',
                render: (_, record: EmployeeCertificate) =>
                  record.isVerified ? <Tag color="green">Verified</Tag> : <Tag color="orange">Pending</Tag>,
              },
              {
                title: 'Points',
                dataIndex: 'points',
                render: (v: number | null) => (v !== null ? <Tag color="cyan">{v}</Tag> : '—'),
              },
              {
                title: 'Actions',
                render: (_, record: EmployeeCertificate) =>
                  record.isVerified ? (
                    '—'
                  ) : (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                        Edit
                      </Button>
                      <Popconfirm title="Delete this certificate?" onConfirm={() => handleDelete(record)}>
                        <Button size="small" danger icon={<DeleteOutlined />}>
                          Delete
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
              },
            ]}
          />
          {certificates.length === 0 && !loading && (
            <div style={{ color: '#999' }}>No certificates declared yet.</div>
          )}
        </Card>
      </Col>

      <Modal
        title={editingCertificate ? 'Edit certificate' : 'Add certificate'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Image" required>
            <Upload
              listType="picture-card"
              maxCount={1}
              fileList={fileList}
              onRemove={() => {
                setFileList([]);
                setImageUrl(null);
              }}
              customRequest={async (options) => {
                const { file, onSuccess, onError } = options;
                try {
                  const result = await uploadCertificateImage(file as File);
                  setImageUrl(result.imageUrl);
                  onSuccess?.(result);
                } catch (err) {
                  onError?.(err as Error);
                  message.error('Image upload failed');
                }
              }}
              onChange={({ fileList: newFileList }) => setFileList(newFileList)}
            >
              {fileList.length === 0 && (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Upload</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.Item name="name" label="Certificate name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="expiredDate" label="Expiry date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
}
