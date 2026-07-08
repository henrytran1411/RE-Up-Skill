import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  DatePicker,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import axios from 'axios';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import {
  deleteCertificate,
  fetchAllCertificates,
  updateCertificate,
  uploadCertificateImage,
  verifyCertificate,
} from '../../services/certificateService';
import { EmployeeCertificate } from '../../types/certificate';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function CertificatesPage() {
  const [certificates, setCertificates] = useState<EmployeeCertificate[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'verified'>('pending');
  const [loading, setLoading] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<EmployeeCertificate | null>(null);
  const [editTarget, setEditTarget] = useState<EmployeeCertificate | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [verifyForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setCertificates(await fetchAllCertificates());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openVerifyModal = (certificate: EmployeeCertificate) => {
    setVerifyTarget(certificate);
    verifyForm.resetFields();
  };

  const handleVerify = async () => {
    if (!verifyTarget) return;
    const values = await verifyForm.validateFields();
    setSaving(true);
    try {
      await verifyCertificate(verifyTarget.id, values.points);
      message.success('Certificate verified');
      setVerifyTarget(null);
      loadData();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to verify certificate'));
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (certificate: EmployeeCertificate) => {
    setEditTarget(certificate);
    setImageUrl(certificate.imageUrl);
    setFileList([{ uid: certificate.id, name: certificate.name, status: 'done', url: certificate.imageUrl }]);
    editForm.setFieldsValue({
      name: certificate.name,
      description: certificate.description ?? undefined,
      expiredDate: dayjs(certificate.expiredDate),
    });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await updateCertificate(editTarget.id, {
        name: values.name,
        description: values.description,
        expiredDate: values.expiredDate.format('YYYY-MM-DD'),
        imageUrl: imageUrl ?? editTarget.imageUrl,
      });
      message.success('Certificate updated');
      setEditTarget(null);
      loadData();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to update certificate'));
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

  const filtered = certificates.filter((c) => {
    if (statusFilter === 'pending') return !c.isVerified;
    if (statusFilter === 'verified') return c.isVerified;
    return true;
  });

  return (
    <Card
      title="Certificates"
      extra={
        <Select
          value={statusFilter}
          style={{ width: 160 }}
          onChange={setStatusFilter}
          options={[
            { value: 'pending', label: 'Pending' },
            { value: 'verified', label: 'Verified' },
            { value: 'all', label: 'All' },
          ]}
        />
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        columns={[
          {
            title: 'Image',
            dataIndex: 'imageUrl',
            render: (url: string) => <Image src={url} width={48} height={48} style={{ objectFit: 'cover' }} />,
          },
          { title: 'Employee', dataIndex: ['employee', 'fullName'], render: (v: string | undefined) => v ?? '—' },
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
            render: (_, record: EmployeeCertificate) => (
              <Space>
                {!record.isVerified && (
                  <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openVerifyModal(record)}>
                    Verify
                  </Button>
                )}
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

      <Modal
        title={`Verify "${verifyTarget?.name ?? ''}"`}
        open={verifyTarget !== null}
        onOk={handleVerify}
        onCancel={() => setVerifyTarget(null)}
        confirmLoading={saving}
      >
        <Form form={verifyForm} layout="vertical">
          <Form.Item
            name="points"
            label="Points to award"
            rules={[{ required: true }]}
            tooltip="How many points this certificate is worth. Cannot be changed once verified."
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Edit "${editTarget?.name ?? ''}"`}
        open={editTarget !== null}
        onOk={handleEdit}
        onCancel={() => setEditTarget(null)}
        confirmLoading={saving}
      >
        <Form form={editForm} layout="vertical">
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
    </Card>
  );
}
